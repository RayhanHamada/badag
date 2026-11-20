import { describe, expect, it } from "vitest";

import { createDAG } from "./dag";
import { defineNode } from "./definition";
import type { AnyNodeDefinition } from "./definition";

function node(key: string, type = "task"): AnyNodeDefinition {
    return defineNode({ key, type, run: () => key });
}

describe("DAG", () => {
    it("builds a spec and an implementation map", () => {
        const graph = createDAG("etl");

        const extract = defineNode({
            key: "extract",
            type: "task",
            run: () => "raw",
        });

        const load = defineNode({
            key: "load",
            type: "task",
            run: () => "stored",
        });

        graph.add(extract).add(load).link("extract", "load");

        const built = graph.build();

        expect(built.spec.key).toBe("etl");
        expect(built.spec.nodes.map((entry) => entry.key)).toStrictEqual([
            "extract",
            "load",
        ]);
        expect(built.spec.edges).toStrictEqual([
            { from: "extract", to: "load" },
        ]);
        expect(built.implementations.get("extract")).toBe(
            extract.implementation
        );
    });

    it("throws on a duplicate key and keeps the first registration", () => {
        const graph = createDAG("etl");

        const first = defineNode({
            key: "extract",
            type: "task",
            run: () => 1,
        });

        graph.add(first);

        expect(() =>
            graph.add(
                defineNode({ key: "extract", type: "task", run: () => 2 })
            )
        ).toThrow(/Node "extract" is already declared in DAG "etl"/u);
        expect(graph.nodes().size).toBe(1);
        expect(graph.resolve("extract")).toBe(first.implementation);
    });

    it("throws on a duplicate key inside one batch", () => {
        const graph = createDAG("etl");

        expect(() => graph.addAll([node("extract"), node("extract")])).toThrow(
            /already declared/u
        );
        expect(graph.nodes().size).toBe(0);
        expect(graph.resolve("extract")).toBeUndefined();
    });

    it("rolls back nodes and implementations when an edge is rejected", () => {
        const graph = createDAG("etl");

        expect(() =>
            graph.apply({
                nodes: [node("a"), node("b")],
                edges: [
                    { from: "a", to: "b" },
                    { from: "b", to: "a" },
                ],
            })
        ).toThrow(/cycle/u);

        expect(graph.nodes().size).toBe(0);
        expect(graph.resolve("a")).toBeUndefined();
        expect(graph.resolve("b")).toBeUndefined();
    });

    it("returns undefined for a key with no implementation", () => {
        expect(createDAG("etl").resolve("ghost")).toBeUndefined();
    });

    it("keeps an open node type and config untouched", () => {
        const graph = createDAG("alerts");

        graph.add(
            defineNode({
                key: "notify",
                type: "email",
                config: { to: "ops@example.com" },
                run: () => true,
            })
        );

        expect(graph.build().spec.nodes).toStrictEqual([
            {
                key: "notify",
                type: "email",
                config: { to: "ops@example.com" },
            },
        ]);
    });

    it("serializes the spec without callbacks", () => {
        const graph = createDAG("etl");

        graph.addAll([node("extract"), node("load")]);
        graph.link("extract", "load");

        const built = graph.build();
        const encoded = JSON.stringify(built.spec);

        expect(encoded).not.toContain('"run"');
        expect(() => structuredClone(built.spec)).not.toThrow();
        expect(Object.isFrozen(built.spec)).toBeTruthy();
    });

    it("copies the implementation map at build time", () => {
        const graph = createDAG("etl");

        graph.add(node("extract"));

        const built = graph.build();

        graph.add(node("later"));

        expect(built.implementations.has("later")).toBeFalsy();
        expect(graph.resolve("later")).toBeDefined();
    });

    it("is fluent and rejects an unknown endpoint", () => {
        const graph = createDAG("etl");

        graph.addAll([node("a"), node("b")]);

        expect(graph.link("a", "b")).toBe(graph);
        expect(() => graph.link("a", "ghost")).toThrow(/not registered/u);
    });
});
