import { describe, expect, it } from "vitest";

import { createDAG } from "./dag";
import { labeled } from "./notation";
import { branch, task } from "./presets";

describe("notation", () => {
    it("chains unlabeled edges between compute nodes", () => {
        const dag = createDAG("etl");
        const extract = task("extract", { run: () => "raw" });
        const transform = task("transform", { run: () => "clean" });
        const load = task("load", { run: () => "stored" });

        expect(dag.parse`${extract} >> ${transform} >> ${load}`).toBe(dag);

        expect(dag.spec().edges).toStrictEqual([
            { from: "extract", to: "transform" },
            { from: "transform", to: "load" },
        ]);
    });

    it("infers labels from targets of a router", () => {
        const dag = createDAG("pricing");

        const route = branch("route", {
            branches: ["us", "eu"] as const,
            choose: () => "us",
        });

        const us = task("us", { run: () => 1 });
        const eu = task("eu", { run: () => 2 });

        expect(dag.parse`${route} >> ${[us, eu]}`).toBe(dag);

        expect(dag.spec().edges).toStrictEqual([
            { from: "route", to: "us", label: "us" },
            { from: "route", to: "eu", label: "eu" },
        ]);
    });

    it("honors an explicit label override", () => {
        const dag = createDAG("pricing");

        const route = branch("route", {
            branches: ["us"] as const,
            choose: () => "us",
        });

        const processUs = task("process-us", { run: () => 1 });

        expect(dag.parse`${route} >> ${labeled("us", processUs)}`).toBe(dag);

        expect(dag.spec().edges).toStrictEqual([
            { from: "route", to: "process-us", label: "us" },
        ]);
    });

    it("reverses direction for <<", () => {
        const dag = createDAG("etl");
        const first = task("first", { run: () => 1 });
        const second = task("second", { run: () => 2 });

        expect(dag.parse`${first} << ${second}`).toBe(dag);

        expect(dag.spec().edges).toStrictEqual([
            { from: "second", to: "first" },
        ]);
    });

    it("registers a single operand without an edge", () => {
        const dag = createDAG("etl");

        expect(dag.parse`${task("lonely", { run: () => 1 })}`).toBe(dag);

        expect(dag.nodes().size).toBe(1);
        expect(dag.spec().edges).toStrictEqual([]);
    });

    it("allows the same definition across statements", () => {
        const dag = createDAG("etl");
        const a = task("a", { run: () => 1 });
        const b = task("b", { run: () => 2 });
        const c = task("c", { run: () => 3 });

        expect(dag.parse`${a} >> ${b}`).toBe(dag);
        expect(dag.parse`${b} >> ${c}`).toBe(dag);

        expect(dag.spec().edges).toStrictEqual([
            { from: "a", to: "b" },
            { from: "b", to: "c" },
        ]);
    });

    it("rejects a newline, empty set, nested list, and bad operand", () => {
        const dag = createDAG("etl");
        const a = task("a", { run: () => 1 });
        const b = task("b", { run: () => 2 });
        // SAFETY: deliberately invalid operands to exercise the parser guards.
        const bad = 42 as never;
        // SAFETY: a nested list is invalid and must be rejected.
        const nested = [[a]] as never;

        expect(
            () => dag.parse`${a} >> ${b}
        `
        ).toThrow(/multiple lines/u);
        expect(() => dag.parse`${[]} >> ${a}`).toThrow(/empty task list/u);
        expect(() => dag.parse`${nested}`).toThrow(/nest/u);
        expect(() => dag.parse`${bad}`).toThrow(/expects tasks/u);
    });

    it("rejects leading text, a bad operator, and a labeled source", () => {
        const dag = createDAG("etl");
        const a = task("a", { run: () => 1 });
        const b = task("b", { run: () => 2 });

        expect(() => dag.parse`oops ${a}`).toThrow(/before the first/u);
        expect(() => dag.parse`${a} -> ${b}`).toThrow(/Unrecognized/u);
        expect(() => dag.parse`${labeled("us", a)} >> ${b}`).toThrow(
            /target of an edge/u
        );
    });
});
