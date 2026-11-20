import { describe, expect, it } from "vitest";

import { createGraph } from "./graph";

/**
 * Golden specs. The pinned revisions cover the canonical form: if node order,
 * edge order, or object key order starts leaking into the hash, these fail.
 */
describe("golden specs", () => {
    it("reproduces the README graph", () => {
        const graph = createGraph("daily-pricing");

        graph.addNodes([
            {
                key: "source-ready",
                type: "sensor",
                config: { pokeIntervalMs: 60_000 },
            },
            { key: "extract", type: "task" },
            { key: "route", type: "branch" },
            { key: "us", type: "task" },
            { key: "eu", type: "task" },
            { key: "publish", type: "task" },
        ]);
        graph.link("source-ready", "extract");
        graph.link("extract", "route");
        graph.link("route", "us", "us");
        graph.link("route", "eu", "eu");
        graph.link(["us", "eu"], "publish");

        expect(graph.spec()).toStrictEqual({
            specVersion: 1,
            key: "daily-pricing",
            revision: "11ca7f00c457cebf",
            nodes: [
                {
                    key: "source-ready",
                    type: "sensor",
                    config: { pokeIntervalMs: 60_000 },
                },
                { key: "extract", type: "task", config: {} },
                { key: "route", type: "branch", config: {} },
                { key: "us", type: "task", config: {} },
                { key: "eu", type: "task", config: {} },
                { key: "publish", type: "task", config: {} },
            ],
            edges: [
                { from: "source-ready", to: "extract" },
                { from: "extract", to: "route" },
                { from: "route", to: "us", label: "us" },
                { from: "route", to: "eu", label: "eu" },
                { from: "us", to: "publish" },
                { from: "eu", to: "publish" },
            ],
        });
    });

    it("reproduces the etl serialization fixture", () => {
        const graph = createGraph("etl");

        graph.addNodes([
            {
                key: "extract",
                type: "task",
                config: { timeout_ms: 100, triggerRule: "all_done" },
            },
            { key: "transform", type: "task" },
            { key: "load", type: "task" },
        ]);
        graph.link("extract", "transform");
        graph.link("transform", "load");

        expect(graph.spec()).toStrictEqual({
            specVersion: 1,
            key: "etl",
            revision: "f49ee0f182af27a5",
            nodes: [
                {
                    key: "extract",
                    type: "task",
                    config: { timeout_ms: 100, triggerRule: "all_done" },
                },
                { key: "transform", type: "task", config: {} },
                { key: "load", type: "task", config: {} },
            ],
            edges: [
                { from: "extract", to: "transform" },
                { from: "transform", to: "load" },
            ],
        });
    });

    it("reproduces the complex serialization fixture", () => {
        const graph = createGraph("complex");

        graph.addNodes([
            { key: "extract", type: "task" },
            { key: "cleanA", type: "task" },
            { key: "cleanB", type: "task" },
            { key: "join", type: "task" },
            { key: "validate", type: "task" },
            { key: "publish", type: "task" },
        ]);
        graph.link("extract", ["cleanA", "cleanB"]);
        graph.link(["cleanA", "cleanB"], "join");
        graph.link("join", "validate");
        graph.link("validate", "publish");

        expect(graph.spec()).toStrictEqual({
            specVersion: 1,
            key: "complex",
            revision: "18d4b4b80b40703f",
            nodes: [
                { key: "extract", type: "task", config: {} },
                { key: "cleanA", type: "task", config: {} },
                { key: "cleanB", type: "task", config: {} },
                { key: "join", type: "task", config: {} },
                { key: "validate", type: "task", config: {} },
                { key: "publish", type: "task", config: {} },
            ],
            edges: [
                { from: "extract", to: "cleanA" },
                { from: "extract", to: "cleanB" },
                { from: "cleanA", to: "join" },
                { from: "cleanB", to: "join" },
                { from: "join", to: "validate" },
                { from: "validate", to: "publish" },
            ],
        });
    });
});
