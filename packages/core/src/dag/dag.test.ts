import { describe, expect, it } from "vitest";

import { createDAG } from "./dag";
import { defineNode } from "./definition";
import type { AnyNodeDefinition } from "./definition";

function node(key: string, type = "task"): AnyNodeDefinition {
    return defineNode({ key, type, run: () => key });
}

const SHA256_HEX = /^[0-9a-f]{64}$/u;

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

    it("keeps a declaration whose implementation is missing", () => {
        const graph = createDAG("alerts");

        graph.add(defineNode({ key: "notify", type: "trigger" }));

        expect(graph.nodes().has("notify")).toBeTruthy();
        expect(graph.resolve("notify")).toBeUndefined();
        expect(graph.build().implementations.size).toBe(0);
    });

    it("rejects a duplicate even when the first declaration has no code", () => {
        const graph = createDAG("alerts");

        graph.add(defineNode({ key: "notify", type: "trigger" }));

        expect(() =>
            graph.add(defineNode({ key: "notify", type: "trigger" }))
        ).toThrow(/already declared in DAG "alerts"/u);
        expect(() =>
            graph.add(
                defineNode({
                    key: "notify",
                    type: "trigger",
                    run: () => true,
                })
            )
        ).toThrow(/already declared in DAG "alerts"/u);
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
            graph._apply({
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

    it("hashes the registered tasks", async () => {
        const graph = createDAG("etl");

        graph.addAll([node("extract"), node("load")]);

        await expect(graph.hash()).resolves.toMatch(SHA256_HEX);
        await expect(graph.build().hash()).resolves.toBe(await graph.hash());
    });

    it("hashes task content, not registration order or keys", async () => {
        const extract = defineNode({
            key: "extract",
            type: "task",
            config: { stage: 1 },
            run: () => 1,
        });

        const load = defineNode({
            key: "load",
            type: "task",
            config: { stage: 2 },
            run: () => 2,
        });

        const renamedExtract = defineNode({
            key: "aaa",
            type: "task",
            config: { stage: 1 },
            run: () => 1,
        });

        const renamedLoad = defineNode({
            key: "bbb",
            type: "task",
            config: { stage: 2 },
            run: () => 2,
        });

        const forward = createDAG("etl").addAll([extract, load]);
        const reverse = createDAG("etl").addAll([load, extract]);

        const renamed = createDAG("etl").addAll([renamedExtract, renamedLoad]);

        const [first, second, third] = await Promise.all([
            forward.hash(),
            reverse.hash(),
            renamed.hash(),
        ]);

        expect(second).toBe(first);
        expect(third).toBe(first);
    });

    it("keeps the DAG hash independent of wiring", async () => {
        const extract = node("extract");
        const load = node("load");
        const unwired = createDAG("etl").addAll([extract, load]);

        const wired = createDAG("etl")
            .addAll([extract, load])
            .link("extract", "load");

        await expect(wired.hash()).resolves.toBe(await unwired.hash());
        expect(wired.spec().revision).not.toBe(unwired.spec().revision);
    });

    it("changes the DAG hash when a task's behavior changes", async () => {
        const graph = createDAG("etl").add(
            defineNode({ key: "extract", type: "task", run: () => 1 })
        );

        const before = await graph.hash();

        graph.add(defineNode({ key: "load", type: "task", run: () => 2 }));

        await expect(graph.hash()).resolves.not.toBe(before);
    });

    it("ignores description-only changes in the DAG hash", async () => {
        const first = createDAG("etl").add(
            defineNode({
                key: "extract",
                type: "task",
                config: { description: "Raw" },
                run: () => 1,
            })
        );

        const second = createDAG("etl").add(
            defineNode({
                key: "extract",
                type: "task",
                config: { description: "Cleaned" },
                run: () => 1,
            })
        );

        await expect(second.hash()).resolves.toBe(await first.hash());
    });

    it("captures the DAG hash at build time", async () => {
        const graph = createDAG("etl").add(node("extract"));
        const built = graph.build();
        const builtBefore = await built.hash();

        graph.add(node("load"));

        await expect(built.hash()).resolves.toBe(builtBefore);
        await expect(graph.hash()).resolves.not.toBe(builtBefore);
    });

    it("is fluent and rejects an unknown endpoint", () => {
        const graph = createDAG("etl");

        graph.addAll([node("a"), node("b")]);

        expect(graph.link("a", "b")).toBe(graph);
        expect(() => graph.link("a", "ghost")).toThrow(/not registered/u);
    });
});
