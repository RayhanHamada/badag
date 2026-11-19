import { describe, expect, expectTypeOf, it } from "vitest";

import { branch, createDAG, task as createTask } from "../index";
import type { DAGTask, TaskLike, WiringOperand, DAG } from "../index";

// A generic helper widens ids to string, so its wiring is not statically
// checked; it must still typecheck.
const connect = (dag: DAG, from: TaskLike, to: TaskLike): void => {
    dag.addDependency(from, to);
};

const parseStringOperands = () =>
    // @ts-expect-error - operands are tasks, not strings
    createDAG("etl").parse`${"extract"} >> ${"load"}`;

const parseNumberOperands = () =>
    // @ts-expect-error - operands are tasks, not numbers
    createDAG("etl").parse`${createTask("extract", { fn: () => 0 })} >> ${0}`;

describe("compile-time parse validation", () => {
    it("types parse operands and registers tasks", () => {
        const extract = createTask("extract", { fn: () => "raw" });
        const transform = createTask("transform", { fn: () => "clean" });
        const load = createTask("load", { fn: () => "stored" });

        const dag = createDAG("etl").parse`${extract} >> ${[transform, load]}`;

        expect(dag.tasks.size).toBe(3);
        expectTypeOf(dag).toExtend<DAG<"etl">>();
        expectTypeOf<WiringOperand>().toEqualTypeOf<
            TaskLike | readonly TaskLike[]
        >();
        expectTypeOf(extract).toExtend<WiringOperand>();
        expectTypeOf([extract, transform]).toExtend<WiringOperand>();

        expectTypeOf<
            readonly [TaskLike, readonly TaskLike[]]
        >().not.toExtend<WiringOperand>();

        expect(parseStringOperands).toBeTypeOf("function");
        expect(parseNumberOperands).toBeTypeOf("function");
    });

    it("accumulates parsed tasks as signatures", () => {
        const extract = createTask("extract", { fn: () => "raw" });
        const load = createTask("load", { fn: () => "stored" });

        const parsed = createDAG("etl").parse`${extract} >> ${[load]}`;

        // Re-passing the same definition is allowed: the signature already
        // registered is identical, not merely a duplicate.
        expect(() => parsed.parse`${extract} >> ${load}`).not.toThrow();
        expect(() => parsed.parse`${extract}`).not.toThrow();
        expect(parsed.tasks.size).toBe(2);
        expectTypeOf(parsed.getTask("extract")).toEqualTypeOf<
            DAGTask<"extract"> | undefined
        >();
    });

    it("rejects a duplicate registered through parse", () => {
        const extract = createTask("extract", { fn: () => "raw" });
        const dag = createDAG("etl").parse`${extract}`;
        const duplicate = createTask("extract", { fn: () => 1 });

        // @ts-expect-error - parse registered "extract" with another signature
        const viaParse = () => dag.parse`${duplicate}`;

        expect(viaParse).toThrow('Task "extract" already exists in DAG "etl"');
    });

    it("rejects a reparsed branch with a different declared set", () => {
        const wide = branch("route", {
            branches: ["us", "eu"],
            choose: () => "us",
        });

        const narrow = branch("route", {
            branches: ["us"],
            choose: () => "us",
        });

        const dag = createDAG("redeclare").parse`${wide}`;

        // @ts-expect-error - same id, different declared branches
        const conflict = () => dag.parse`${narrow}`;

        expect(conflict).toThrow(
            'Task "route" already exists in DAG "redeclare"'
        );
    });

    it("opts out of parse checks when the DAG type is widened", () => {
        const extract = createTask("extract", { fn: () => "raw" });
        const dag: DAG = createDAG("etl");
        const duplicate = createTask("extract", { fn: () => 1 });

        expect(() => dag.parse`${extract}`).not.toThrow();
        expect(() => dag.parse`${duplicate}`).toThrow(/already exists/u);
    });

    it("rejects a cycle wired through parse", () => {
        const extract = createTask("extract", { fn: () => "raw" });
        const load = createTask("load", { fn: () => "stored" });
        const sink = createTask("sink", { fn: () => "done" });

        const dag = createDAG("etl").parse`${extract} >> ${load}`
            .parse`${load} >> ${sink}`;

        expect(() => dag.parse`${sink} >> ${extract}`).toThrow(
            'Dependency "sink" -> "extract" creates a cycle'
        );
    });

    it("preserves literal ids and handle types", () => {
        const extract = createTask("extract", { fn: () => "raw" });
        const dag = createDAG("typed").parse`${extract}`;

        expectTypeOf(extract.id).toEqualTypeOf<"extract">();
        expectTypeOf(dag).toExtend<DAG>();
        expectTypeOf(dag.getTask("extract")).toEqualTypeOf<
            DAGTask<"extract"> | undefined
        >();
    });

    it("rejects cycles, duplicates, and self edges", () => {
        const extract = createTask("extract", { fn: () => "raw" });
        const load = createTask("load", { fn: () => "stored" });
        const dag = createDAG("typed").parse`${extract} >> ${load}`;

        const createCycle = () => dag.parse`${load} >> ${extract}`;

        expect(createCycle).toThrow(
            'Dependency "load" -> "extract" creates a cycle'
        );

        const duplicate = createTask("extract", { fn: () => 1 });

        // @ts-expect-error - same id with a different signature
        const registerDuplicate = () => dag.parse`${duplicate}`;

        expect(registerDuplicate).toThrow(
            'Task "extract" already exists in DAG "typed"'
        );

        const createSelfEdge = () => dag.parse`${load} >> ${load}`;

        expect(createSelfEdge).toThrow("A task cannot depend on itself");

        const createLoop = () =>
            createDAG("loop").parse`${extract} >> ${load} >> ${extract}`;

        expect(createLoop).toThrow(
            'Dependency "load" -> "extract" creates a cycle'
        );
    });

    it("rejects overlap between adjacent groups", () => {
        const extract = createTask("extract", { fn: () => "raw" });
        const load = createTask("load", { fn: () => "stored" });
        const graph = createDAG("overlap");

        const createOverlap = () =>
            graph.parse`${[extract, load]} >> ${[load, extract]}`;

        expect(createOverlap).toThrow("A task cannot depend on itself");
    });

    it("rejects a cycle spread across kept parse results", () => {
        const extract = createTask("extract", { fn: () => "raw" });
        const transform = createTask("transform", { fn: () => "clean" });
        const load = createTask("load", { fn: () => "stored" });

        const first = createDAG("steps").parse`${extract} >> ${transform}`;
        const second = first.parse`${transform} >> ${load}`;

        const createCycle = () => second.parse`${load} >> ${extract}`;

        expect(createCycle).toThrow(
            'Dependency "load" -> "extract" creates a cycle'
        );
    });

    it("rejects a duplicate inside one parse call", () => {
        const first = createTask("same", { fn: () => 1 });
        const second = createTask("same", { fn: () => "two" });

        // @ts-expect-error - task id collisions in one parse call
        const registerBoth = () => createDAG("batch").parse`${[first, second]}`;

        expect(registerBoth).toThrow(
            'Task "same" already exists in DAG "batch"'
        );
    });

    it("rejects branch wiring outside the declared branches", () => {
        const route = branch("route", {
            branches: ["us", "eu"],
            choose: () => "us",
        });

        const us = createTask("us", { fn: () => 0 });
        const eu = createTask("eu", { fn: () => 0 });
        const apac = createTask("apac", { fn: () => 0 });

        const valid = createDAG("branches").parse`${route} >> ${[us, eu]}`;

        const undeclared = () => valid.parse`${route} >> ${apac}`;

        expect(undeclared).toThrow(
            'Branch "route" cannot route to "apac"; declared branches are "us", "eu"'
        );

        const incomplete = () => createDAG("partial").parse`${route} >> ${us}`;

        expect(incomplete).toThrow(
            'Branch "route" must route to declared branch "eu"'
        );
    });

    it("accepts a branch wired to exactly its declared branches", () => {
        const route = branch("route", {
            branches: ["us", "eu"],
            choose: () => "us",
        });

        const us = createTask("us", { fn: () => 0 });
        const eu = createTask("eu", { fn: () => 0 });

        const dag = createDAG("branch-ok").parse`${route} >> ${[us, eu]}`;

        expect(dag.tasks.size).toBe(3);
    });

    it("accepts a split declaration and wiring across kept calls", () => {
        const route = branch("route", {
            branches: ["us"],
            choose: () => "us",
        });

        const us = createTask("us", { fn: () => 0 });

        // The declaration lives on the DAG type, so a later call is checked.
        const dag = createDAG("split").parse`${route}`.parse`${route} >> ${us}`;

        expect(dag.tasks.size).toBe(2);
    });

    it("accepts a branch that declares no branches", () => {
        const route = branch("route", { choose: () => "anything" });
        const anything = createTask("anything", { fn: () => 0 });

        const dag = createDAG("free").parse`${route} >> ${anything}`;

        expect(dag.tasks.size).toBe(2);
    });

    it("accepts a branch wired to another branch task", () => {
        const route = branch("route", {
            branches: ["next"],
            choose: () => "next",
        });

        const next = branch("next", { branches: ["us"], choose: () => "us" });
        const us = createTask("us", { fn: () => 0 });

        const dag = createDAG("nested").parse`${route} >> ${next} >> ${us}`;

        expect(dag.tasks.size).toBe(3);
    });

    it("rejects an empty declared set routing anywhere", () => {
        const empty = branch("route", {
            branches: [] as const,
            choose: () => [] as const,
        });

        const us = createTask("us", { fn: () => 0 });

        const routed = () => createDAG("empty").parse`${empty} >> ${us}`;

        expect(routed).toThrow(
            'Branch "route" cannot route to "us"; it declares no branches'
        );
    });

    it("rejects a same-id branch with a different declared set", () => {
        const wide = branch("route", {
            branches: ["us", "eu"],
            choose: () => "us",
        });

        const narrow = branch("route", {
            branches: ["us"],
            choose: () => "us",
        });

        const dag = createDAG("redeclare").parse`${wide}`;

        // @ts-expect-error - same id, different declared branches
        const conflict = () => dag.parse`${narrow}`;

        expect(conflict).toThrow(
            'Task "route" already exists in DAG "redeclare"'
        );
    });

    it("accepts repeated, diamond, and generic wiring", () => {
        const extract = createTask("extract", { fn: () => "raw" });
        const transform = createTask("transform", { fn: () => "clean" });
        const load = createTask("load", { fn: () => "stored" });

        const diamond = createDAG("diamond")
            .parse`${extract} >> ${[transform, load]}`
            .parse`${extract} >> ${load}`.parse`${extract}`.parse`${transform}`;

        expect(diamond.tasks.size).toBe(3);

        const generic = createDAG("generic");

        connect(generic, extract, transform);

        expect(generic.tasks.size).toBe(2);
    });
});
