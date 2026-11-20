import { describe, expect, it } from "vitest";

import { createGraph } from "./graph";
import type { Graph } from "./graph";
import type { GraphNodeInput, JsonObject } from "./spec";
import { SPEC_VERSION } from "./spec";

const REVISION = /^[0-9a-f]{16}$/u;

function task(key: string, config?: GraphNodeInput["config"]): GraphNodeInput {
    return { key, type: "task", config };
}

function complexGraph(): Graph {
    const graph = createGraph("complex");

    graph.addNodes([
        task("extract", { timeout_ms: 100 }),
        task("cleanA"),
        task("cleanB"),
        task("join"),
    ]);

    graph.link("extract", ["cleanA", "cleanB"]);
    graph.link(["cleanA", "cleanB"], "join");

    return graph;
}

describe("graph builder", () => {
    it("describes an empty graph", () => {
        const spec = createGraph("empty").spec();

        expect(spec).toStrictEqual({
            specVersion: SPEC_VERSION,
            key: "empty",
            revision: expect.stringMatching(REVISION),
            nodes: [],
            edges: [],
        });
    });

    it("keeps nodes and edges in insertion order", () => {
        const spec = complexGraph().spec();

        expect(spec.nodes.map((node) => node.key)).toStrictEqual([
            "extract",
            "cleanA",
            "cleanB",
            "join",
        ]);
        expect(spec.edges).toStrictEqual([
            { from: "extract", to: "cleanA" },
            { from: "extract", to: "cleanB" },
            { from: "cleanA", to: "join" },
            { from: "cleanB", to: "join" },
        ]);
    });

    it("is idempotent for repeated nodes and links", () => {
        const graph = complexGraph();

        graph.addNodes([task("extract", { timeout_ms: 100 })]);
        graph.link(["cleanA", "cleanB"], "join");

        expect(graph.nodes().size).toBe(4);
        expect(graph.edges()).toHaveLength(4);
    });

    it("rejects a conflicting redefinition and keeps the original", () => {
        const graph = createGraph("g");

        graph.addNodes([task("a")]);

        expect(() => graph.addNodes([{ key: "a", type: "sensor" }])).toThrow(
            /different type or config/u
        );
        expect(graph.nodes().get("a")?.type).toBe("task");
    });

    it("rolls back a rejected batch completely", () => {
        const graph = createGraph("g");

        expect(() =>
            graph.apply({
                nodes: [task("a"), task("b")],
                edges: [
                    { from: "a", to: "b" },
                    { from: "b", to: "a" },
                ],
            })
        ).toThrow(/cycle/u);

        expect(graph.nodes().size).toBe(0);
        expect(graph.edges()).toStrictEqual([]);
    });

    it("rejects self edges", () => {
        const graph = createGraph("g");

        graph.addNodes([task("a")]);

        expect(() => graph.link("a", "a")).toThrow(/cannot depend on itself/u);
        expect(graph.edges()).toStrictEqual([]);
    });

    it("rejects an unknown endpoint without adding an edge", () => {
        const graph = createGraph("g");

        graph.addNodes([task("a")]);

        expect(() => graph.link("a", "ghost")).toThrow(
            /ghost.*not registered/u
        );
        expect(graph.edges()).toStrictEqual([]);
    });

    it("rejects an empty wiring set", () => {
        const graph = createGraph("g");

        graph.addNodes([task("a")]);

        expect(() => graph.link([], "a")).toThrow(/at least one node/u);
    });

    it("keeps parallel labeled edges", () => {
        const graph = createGraph("g");

        graph.addNodes([task("a"), task("b")]);
        graph.link("a", "b", "us");
        graph.link("a", "b", "eu");

        expect(graph.edges()).toStrictEqual([
            { from: "a", to: "b", label: "us" },
            { from: "a", to: "b", label: "eu" },
        ]);
        expect([...graph.downstream("a")]).toStrictEqual(["b"]);
    });

    it("rejects an empty label", () => {
        const graph = createGraph("g");

        graph.addNodes([task("a"), task("b")]);

        expect(() => graph.link("a", "b", " ")).toThrow(
            /label cannot be empty/u
        );
    });

    it("orders nodes by dependency, not insertion", () => {
        const graph = createGraph("g");

        graph.addNodes([task("load"), task("extract"), task("transform")]);
        graph.link("extract", "transform");
        graph.link("transform", "load");

        expect(graph.order()).toStrictEqual(["extract", "transform", "load"]);
    });

    it("exposes upstream and downstream neighbors", () => {
        const graph = complexGraph();

        expect([...graph.upstream("join")].toSorted()).toStrictEqual([
            "cleanA",
            "cleanB",
        ]);
        expect([...graph.downstream("extract")].toSorted()).toStrictEqual([
            "cleanA",
            "cleanB",
        ]);
        expect(graph.downstream("join").size).toBe(0);
    });

    it("rejects reads for an unknown node", () => {
        expect(() => createGraph("g").upstream("ghost")).toThrow(
            /not registered/u
        );
    });

    it("rejects an empty graph key or node key", () => {
        expect(() => createGraph(" ")).toThrow(/Graph key/u);

        const graph = createGraph("g");

        expect(() => graph.addNodes([task(" ")])).toThrow(/Node key/u);
    });

    it("keeps the revision stable when independent declarations move", () => {
        const forward = createGraph("g");
        const backward = createGraph("g");

        forward.addNodes([task("a"), task("b"), task("c")]);
        forward.link("a", "b");
        forward.link("b", "c");

        backward.addNodes([task("c"), task("b"), task("a")]);
        backward.link("a", "b");
        backward.link("b", "c");

        expect(forward.spec().revision).toBe(backward.spec().revision);
        expect(forward.spec().nodes.map((node) => node.key)).toStrictEqual([
            "a",
            "b",
            "c",
        ]);
        expect(backward.spec().nodes.map((node) => node.key)).toStrictEqual([
            "c",
            "b",
            "a",
        ]);
    });

    it("keeps the revision stable when config keys move", () => {
        const left = createGraph("g");
        const right = createGraph("g");

        left.addNodes([
            { key: "a", type: "task", config: { timeout_ms: 100, retries: 2 } },
        ]);
        right.addNodes([
            { key: "a", type: "task", config: { retries: 2, timeout_ms: 100 } },
        ]);

        expect(left.spec().revision).toBe(right.spec().revision);
    });

    it("freezes config at every level and rejects non-finite numbers", () => {
        const config = { nested: { retries: 2 }, list: [1, 2] };
        const graph = createGraph("g");

        graph.addNodes([{ key: "a", type: "task", config }]);

        const before = graph.spec().revision;

        config.nested.retries = 5;
        config.list.push(3);

        expect(graph.spec().revision).toBe(before);
        expect(
            Object.isFrozen(graph.nodes().get("a")?.config.nested)
        ).toBeTruthy();
        expect(() =>
            graph.addNodes([
                { key: "b", type: "task", config: { value: Number.NaN } },
            ])
        ).toThrow(/finite/u);
    });

    it("rejects a non-JSON config value", () => {
        const graph = createGraph("g");
        // @ts-expect-error a function is not JSON; the guard is the point.
        const invalid: JsonObject = { value: () => 1 };

        expect(() =>
            graph.addNodes([{ key: "a", type: "task", config: invalid }])
        ).toThrow(/JSON/u);
    });

    it("returns copies from node, edge, and neighbor reads", () => {
        const graph = complexGraph();

        expect(graph.nodes()).not.toBe(graph.nodes());
        expect(graph.edges()).not.toBe(graph.edges());
        expect(graph.upstream("join")).not.toBe(graph.upstream("join"));
    });

    it("freezes nodes and edges and copies the spec arrays", () => {
        const graph = complexGraph();
        const spec = graph.spec();
        const node = spec.nodes.at(0);
        const edge = spec.edges.at(0);

        if (node === undefined || edge === undefined) {
            throw new Error("expected a node and an edge in the spec");
        }

        expect(Object.isFrozen(node)).toBeTruthy();
        expect(Object.isFrozen(node.config)).toBeTruthy();
        expect(Object.isFrozen(edge)).toBeTruthy();
        expect(spec.edges).not.toBe(graph.edges());
    });

    it("freezes the spec and its arrays", () => {
        const spec = complexGraph().spec();

        expect(Object.isFrozen(spec)).toBeTruthy();
        expect(Object.isFrozen(spec.nodes)).toBeTruthy();
        expect(Object.isFrozen(spec.edges)).toBeTruthy();
    });

    it("reports no findings for a valid graph", () => {
        expect(complexGraph().check()).toStrictEqual([]);
    });
});
