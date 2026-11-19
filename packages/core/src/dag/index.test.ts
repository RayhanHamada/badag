import { describe, expect, it } from "vitest";

import type { TaskFn } from "../task/base";
import { branch } from "../task/branch";
import { delay } from "../task/delay";
import { TASK_KIND_ENUM } from "../task/kind";
import { sensor } from "../task/sensor";
import { shortCircuit } from "../task/short-circuit";
import { task as createTask } from "../task/task";
import type { TaskParamInput, TaskParamOutput } from "../task/task";
import { trigger } from "../task/trigger";
import { TRIGGER_RULE_ENUM } from "../task/trigger-rule";
import { createDAG } from "./dag";
import type { DAG } from "./dag";
import type { DAGTask, TaskLike } from "./registered-task";

function namesOf(dag: DAG): string[] {
    return dag.topologicalSort().map((task) => task.id);
}

function register<const Name extends string, Fn extends TaskFn<Name>>(
    dag: DAG,
    definition: TaskParamOutput<Name, Fn>
): DAGTask<Name> {
    expect(dag.parse`${definition}`).toBe(dag);

    const task = dag.getTask(definition.id);

    if (task === undefined) {
        throw new Error(`Task "${definition.id}" was not registered`);
    }

    return task;
}

function addTask<Fn extends TaskFn<string>>(
    dag: DAG,
    params: TaskParamInput<Fn> & { id: string }
): DAGTask {
    return register(dag, createTask(params.id, params));
}

function requireTask(dag: DAG, name: string): DAGTask {
    const task = dag.getTask(name);

    if (task === undefined) {
        throw new Error(`Task "${name}" was not registered`);
    }

    return task;
}

function downstreamNames(dag: DAG): Record<string, string[]> {
    return Object.fromEntries(
        [...dag.tasks.values()].map((task) => [
            task.id,
            [...task.downstream].map((downstream) => downstream.id).toSorted(),
        ])
    );
}

function buildComplexDag() {
    const extract = createTask("extract", {
        fn: () => "raw",
        description: "Read source data",
    });

    const cleanA = createTask("cleanA", { fn: () => "cleanA" });
    const cleanB = createTask("cleanB", { fn: () => "cleanB" });
    const join = createTask("join", { fn: () => "joined" });
    const validate = createTask("validate", { fn: () => "valid" });
    const publish = createTask("publish", { fn: () => "published" });

    const dag = createDAG("complex");

    expect(
        dag.parse`${extract} >> ${[cleanA, cleanB]} >> ${join} >> ${validate} >> ${publish}`
    ).toBe(dag);

    return {
        cleanA: requireTask(dag, "cleanA"),
        cleanB: requireTask(dag, "cleanB"),
        dag,
        extract: requireTask(dag, "extract"),
        join: requireTask(dag, "join"),
        publish: requireTask(dag, "publish"),
        validate: requireTask(dag, "validate"),
    };
}

function buildChain() {
    const a = createTask("a", { fn: () => "a" });
    const b = createTask("b", { fn: () => "b" });
    const c = createTask("c", { fn: () => "c" });
    const dag = createDAG("etl").parse`${a} >> ${b} >> ${c}`;

    return {
        a: requireTask(dag, "a"),
        b: requireTask(dag, "b"),
        c: requireTask(dag, "c"),
        dag,
    };
}

/**
 * Build the segment array a tagged template would supply.
 *
 * Operator probes need text that cannot be written as an interpolation, since
 * an interpolated value becomes an operand rather than a segment.
 */
function templateSegments(parts: readonly string[]): TemplateStringsArray {
    const segments = [...parts];

    // SAFETY: a tagged template supplies exactly a string array plus a `raw`
    // string array; the parser reads neither `raw` nor any other property.
    return Object.assign(segments, { raw: segments }) as TemplateStringsArray;
}

// Callback identity is reference-based, so duplicate definitions must share it.
const rawFn = (): string => "raw";

// Captures its argument, so reusing the factory yields distinct callbacks.
const syncTableFn = (table: string) => () => table;

describe("DAG.parse", () => {
    it("wires a left-to-right chain", () => {
        const { dag } = buildChain();

        expect(downstreamNames(dag)).toStrictEqual({
            a: ["b"],
            b: ["c"],
            c: [],
        });
        expect(namesOf(dag)).toStrictEqual(["a", "b", "c"]);
    });

    it("wires a diamond from one expression", () => {
        const a = createTask("a", { fn: () => "a" });
        const b = createTask("b", { fn: () => "b" });
        const c = createTask("c", { fn: () => "c" });
        const d = createTask("d", { fn: () => "d" });

        const dag = createDAG("etl").parse`${a} >> ${[b, c]} >> ${d}`;

        expect(downstreamNames(dag)).toStrictEqual({
            a: ["b", "c"],
            b: ["d"],
            c: ["d"],
            d: [],
        });
    });

    it("treats a >> b << c as [a, c] >> b", () => {
        const a = createTask("a", { fn: () => "a" });
        const b = createTask("b", { fn: () => "b" });
        const c = createTask("c", { fn: () => "c" });

        const mixed = createDAG("mixed").parse`${a} >> ${b} << ${c}`;
        const sets = createDAG("sets").parse`${[a, c]} >> ${b}`;

        expect(downstreamNames(mixed)).toStrictEqual(downstreamNames(sets));
        expect(downstreamNames(mixed)).toStrictEqual({
            a: ["b"],
            b: [],
            c: ["b"],
        });
    });

    it("registers a task from a single operand without wiring it", () => {
        const lonely = createTask("lonely", { fn: () => "lonely" });
        const dag = createDAG("etl").parse`${lonely}`;

        expect([...dag.tasks.keys()]).toStrictEqual(["lonely"]);
        expect(downstreamNames(dag)).toStrictEqual({ lonely: [] });
    });

    it("accepts handles and definitions together", () => {
        const { a, dag } = buildChain();
        const d = createTask("d", { fn: () => "d" });

        expect(dag.parse`${a} >> ${d}`).toBe(dag);
        expect(downstreamNames(dag).a).toStrictEqual(["b", "d"]);
    });

    it("accepts an already registered handle", () => {
        const first = createTask("first", { fn: () => "first" });
        const second = createTask("second", { fn: () => "second" });
        const dag = createDAG("etl").parse`${first} >> ${second}`;

        expect(
            dag.parse`${requireTask(dag, "first")} >> ${requireTask(dag, "second")}`
        ).toBe(dag);
        expect(downstreamNames(dag)).toStrictEqual({
            first: ["second"],
            second: [],
        });
    });

    it("returns the same instance so calls keep chaining", () => {
        const a = createTask("a", { fn: () => "a" });
        const b = createTask("b", { fn: () => "b" });
        const c = createTask("c", { fn: () => "c" });
        const dag = createDAG("etl");

        const chained = dag.parse`${a} >> ${b}`.parse`${b} >> ${c}`;

        expect(chained).toBe(dag);
        expect(namesOf(dag)).toStrictEqual(["a", "b", "c"]);
    });

    it("rejects a self-edge", () => {
        const { a, dag } = buildChain();

        expect(() => dag.parse`${a} >> ${a}`).toThrow(
            "A task cannot depend on itself"
        );
    });

    it("rejects a cycle closed by a later parse call", () => {
        const { a, b, dag } = buildChain();

        expect(() => dag.parse`${b} >> ${a}`).toThrow(
            'Dependency "b" -> "a" creates a cycle'
        );
    });

    it("rejects a cycle inside one expression", () => {
        const { a, b, c, dag } = buildChain();

        expect(() => dag.parse`${c} >> ${a} >> ${b}`).toThrow(
            'Dependency "c" -> "a" creates a cycle'
        );
    });

    it("rejects a cycle inside one wiring set", () => {
        const a = createTask("a", { fn: () => "a" });
        const b = createTask("b", { fn: () => "b" });
        const dag = createDAG("etl").parse`${a} >> ${b}`;

        expect(() => dag.parse`${[a, b]} >> ${[a, b]}`).toThrow(
            "A task cannot depend on itself"
        );
    });

    it("rejects a handle from another DAG", () => {
        const other = createDAG("other")
            .parse`${createTask("x", { fn: () => "x" })}`;

        const foreign = requireTask(other, "x");
        const { dag } = buildChain();

        expect(() => dag.parse`${foreign} >> ${requireTask(dag, "a")}`).toThrow(
            "Both tasks must belong to this DAG"
        );
    });

    it("rolls back tasks and edges when a step is rejected", () => {
        const { dag } = buildChain();
        const fresh = createTask("fresh", { fn: () => "fresh" });
        const cycle = requireTask(dag, "a");

        expect(() => dag.parse`${fresh} >> ${cycle} >> ${fresh}`).toThrow(
            /creates a cycle/u
        );
        expect(dag.getTask("fresh")).toBeUndefined();
        expect(downstreamNames(dag)).toStrictEqual({
            a: ["b"],
            b: ["c"],
            c: [],
        });
    });

    it("leaves the graph unchanged when the notation is malformed", () => {
        const { a, dag } = buildChain();
        const fresh = createTask("fresh", { fn: () => "fresh" });

        expect(() => dag.parse`${fresh} & ${a}`).toThrow(
            /Unrecognized wiring syntax/u
        );
        expect(dag.getTask("fresh")).toBeUndefined();
    });

    it("rejects a task id collision without registering", () => {
        const { dag } = buildChain();
        const collision = createTask("a", { fn: () => "other" });

        expect(
            () => dag.parse`${collision} >> ${createTask("z", { fn: () => 0 })}`
        ).toThrow('Task "a" already exists in DAG "etl"');
        expect(dag.getTask("z")).toBeUndefined();
    });

    it("is idempotent for an expression repeated in full", () => {
        const { a, b, dag } = buildChain();

        expect(dag.parse`${a} >> ${b}`).toBe(dag);
        expect(downstreamNames(dag).a).toStrictEqual(["b"]);
    });

    it("enforces declared branch wiring", () => {
        const empty = branch("empty", {
            branches: [],
            choose: () => [],
        });

        const us = createTask("us", { fn: () => "us" });
        const eu = createTask("eu", { fn: () => "eu" });

        const dag = createDAG("etl");

        // A branch that declares no `branches` at all stays unconstrained.
        const route = branch("route", { choose: () => "us" as const });

        expect(dag.parse`${route} >> ${us}`).toBe(dag);
        expect(downstreamNames(dag).route).toStrictEqual(["us"]);

        expect(() => dag.parse`${empty} >> ${us}`).toThrow(
            'Branch "empty" cannot route to "us"; it declares no branches'
        );

        const declared = branch("declared", {
            branches: ["us", "eu"],
            choose: () => "us" as const,
        });

        expect(dag.parse`${declared} >> ${[us, eu]}`).toBe(dag);
        expect(downstreamNames(dag).declared).toStrictEqual(["eu", "us"]);
    });

    it("wires many-to-many sets", () => {
        const a = createTask("a", { fn: () => "a" });
        const b = createTask("b", { fn: () => "b" });
        const c = createTask("c", { fn: () => "c" });
        const d = createTask("d", { fn: () => "d" });
        const dag = createDAG("etl").parse`${[a, b]} >> ${[c, d]}`;

        expect(downstreamNames(dag)).toStrictEqual({
            a: ["c", "d"],
            b: ["c", "d"],
            c: [],
            d: [],
        });
    });

    it("builds one graph across parse calls", () => {
        const a = createTask("a", { fn: () => "a" });
        const b = createTask("b", { fn: () => "b" });
        const c = createTask("c", { fn: () => "c" });
        const d = createTask("d", { fn: () => "d" });

        const dag = createDAG("etl").parse`${a} >> ${b}`
            .parse`${b} >> ${[c, d]}`;

        expect(downstreamNames(dag)).toStrictEqual({
            a: ["b"],
            b: ["c", "d"],
            c: [],
            d: [],
        });
        expect(namesOf(dag)).toStrictEqual(["a", "b", "c", "d"]);
    });

    it("continues a parse-built graph with another parse call", () => {
        const a = createTask("a", { fn: () => "a" });
        const b = createTask("b", { fn: () => "b" });
        const c = createTask("c", { fn: () => "c" });

        const dag = createDAG("etl").parse`${a} >> ${b}`.parse`${b} >> ${c}`;

        expect(downstreamNames(dag)).toStrictEqual({
            a: ["b"],
            b: ["c"],
            c: [],
        });
    });

    it("keeps the source order of independent wiring", () => {
        const a = createTask("a", { fn: () => "a" });
        const b = createTask("b", { fn: () => "b" });

        const dag = createDAG("etl").parse`${a}`.parse`${b}`;

        expect([...dag.tasks.keys()]).toStrictEqual(["a", "b"]);
    });

    it("preserves definition metadata registered through parse", () => {
        const extract = createTask("extract", {
            fn: () => "raw",
            description: "Read source data",
            config: { timeout_ms: 500 },
            triggerRule: TRIGGER_RULE_ENUM.AllDone,
        });

        const dag = createDAG("etl")
            .parse`${extract} >> ${createTask("load", { fn: () => "stored" })}`;

        const handle = requireTask(dag, "extract");

        expect(handle.description).toBe("Read source data");
        expect(handle.config).toStrictEqual({ timeout_ms: 500 });
        expect(handle.triggerRule).toBe(TRIGGER_RULE_ENUM.AllDone);
        expect(handle.definition).toBe(extract);
    });

    it("assigns the same task id in another DAG for the same definition", () => {
        const definition = createTask("extract", { fn: () => "raw" });

        const viaFirst = requireTask(
            createDAG("first").parse`${definition}`,
            "extract"
        );

        const viaSecond = requireTask(
            createDAG("second").parse`${definition}`,
            "extract"
        );

        expect(viaFirst.id).toBe(viaSecond.id);
    });

    it("registers every task kind through the notation", () => {
        const regular = createTask("regular", { fn: () => 0 });
        const ready = sensor("ready", { predicate: () => true });
        const settle = delay("settle", { durationMs: 1000 });
        const route = shortCircuit("gate", { condition: () => false });
        const start = trigger("start-child", { dagId: "child" });

        const dag = createDAG("kinds")
            .parse`${regular} >> ${ready} >> ${settle} >> ${route} >> ${start}`;

        expect(dag.topologicalSort().map((task) => task.kind)).toStrictEqual([
            TASK_KIND_ENUM.Task,
            TASK_KIND_ENUM.Sensor,
            TASK_KIND_ENUM.Delay,
            TASK_KIND_ENUM.ShortCircuit,
            TASK_KIND_ENUM.Trigger,
        ]);
    });

    it("serializes upstream and downstream ids after parse", () => {
        const a = createTask("a", { fn: () => "a" });
        const b = createTask("b", { fn: () => "b" });
        const c = createTask("c", { fn: () => "c" });

        const json = createDAG("etl").parse`${a} >> ${b} << ${c}`.toJSON();

        expect(
            json.tasks.map((task) => [task.id, task.upstream, task.downstream])
        ).toStrictEqual([
            ["a", [], ["b"]],
            ["b", ["a", "c"], []],
            ["c", [], ["b"]],
        ]);
    });

    it("routes a declared branch set with a left-shift operator", () => {
        const declared = branch("declared", {
            branches: ["us", "eu"],
            choose: () => "us" as const,
        });

        const us = createTask("us", { fn: () => "us" });
        const eu = createTask("eu", { fn: () => "eu" });

        const dag = createDAG("etl").parse`${[us, eu]} << ${declared}`;

        expect(downstreamNames(dag).declared).toStrictEqual(["eu", "us"]);
    });

    it("accepts readonly operand tuples", () => {
        const a = createTask("a", { fn: () => "a" });
        const b = createTask("b", { fn: () => "b" });
        const c = createTask("c", { fn: () => "c" });

        const pair = [a, b] as const;
        const dag = createDAG("etl").parse`${pair} >> ${c}`;

        expect(downstreamNames(dag)).toStrictEqual({
            a: ["c"],
            b: ["c"],
            c: [],
        });
    });

    it("accepts dotted, dashed, and unicode task ids", () => {
        const first = createTask("extract-daily", { fn: () => 0 });
        const second = createTask("ünïcode_task", { fn: () => 0 });
        const third = createTask("extract.users", { fn: () => 0 });
        const dag = createDAG("etl").parse`${first} >> ${second} >> ${third}`;

        expect([...dag.tasks.keys()]).toStrictEqual([
            "extract-daily",
            "ünïcode_task",
            "extract.users",
        ]);
        expect(downstreamNames(dag)["extract-daily"]).toStrictEqual([
            "ünïcode_task",
        ]);
        expect(downstreamNames(dag)["ünïcode_task"]).toStrictEqual([
            "extract.users",
        ]);
    });

    it("keeps a duplicate definition's metadata from the first registration", () => {
        const first = createTask("extract", {
            fn: rawFn,
            description: "first",
        });

        const duplicate = createTask("extract", {
            fn: rawFn,
            description: "second",
        });

        const dag = createDAG("etl").parse`${first}`;

        expect(dag.parse`${duplicate}`).toBe(dag);
        expect(requireTask(dag, "extract").description).toBe("first");
        expect(dag.tasks.size).toBe(1);
    });

    it("rejects a capture-only duplicate in a wiring expression", () => {
        const customers = createTask("sync", {
            fn: syncTableFn("customers"),
        });

        const dag = createDAG("etl").parse`${customers}`;

        expect(
            () =>
                dag.parse`${createTask("sync", { fn: syncTableFn("orders") })}`
        ).toThrow(/different behavior/u);
        expect(dag.tasks.size).toBe(1);
    });

    it("rejects a self edge created across two wiring sets", () => {
        const a = createTask("a", { fn: () => "a" });
        const b = createTask("b", { fn: () => "b" });
        const c = createTask("c", { fn: () => "c" });
        const dag = createDAG("etl").parse`${a} >> ${b}`;

        expect(() => dag.parse`${[a, b]} >> ${[b, c]}`).toThrow(
            "A task cannot depend on itself"
        );
    });

    it("rejects a cycle across mixed operators", () => {
        const a = createTask("a", { fn: () => "a" });
        const b = createTask("b", { fn: () => "b" });
        const dag = createDAG("etl").parse`${a} >> ${b}`;

        expect(() => dag.parse`${a} << ${b}`).toThrow(
            'Dependency "b" -> "a" creates a cycle'
        );
    });

    it("rejects a foreign handle inside a wiring set", () => {
        const other = createDAG("other")
            .parse`${createTask("x", { fn: () => "x" })}`;

        const foreign = requireTask(other, "x");
        const local = createTask("local", { fn: () => 0 });

        const dag = createDAG("etl");

        expect(
            () =>
                dag.parse`${[local, foreign]} >> ${createTask("sink", { fn: () => 0 })}`
        ).toThrow("Both tasks must belong to this DAG");
        expect(dag.tasks.size).toBe(0);
    });

    it("stays usable after a rejected expression", () => {
        const a = createTask("a", { fn: () => "a" });
        const b = createTask("b", { fn: () => "b" });
        const dag = createDAG("etl").parse`${a} >> ${b}`;

        expect(() => dag.parse`${b} >> ${a}`).toThrow(/creates a cycle/u);

        expect(dag.parse`${a} >> ${createTask("c", { fn: () => "c" })}`).toBe(
            dag
        );
        expect(downstreamNames(dag)).toStrictEqual({
            a: ["b", "c"],
            b: [],
            c: [],
        });
    });

    it("rejects an id collision with a task registered by parse", () => {
        const a = createTask("a", { fn: () => "a" });
        const b = createTask("b", { fn: () => "b" });
        const dag = createDAG("etl").parse`${a}`;

        expect(
            () => dag.parse`${b} >> ${createTask("a", { fn: () => "other" })}`
        ).toThrow('Task "a" already exists in DAG "etl"');
        expect(dag.getTask("b")).toBeUndefined();
    });

    it("rejects an empty wiring set on either side", () => {
        const a = createTask("a", { fn: () => "a" });
        const dag = createDAG("etl");

        expect(() => dag.parse`${[]} >> ${a}`).toThrow(
            'Wiring expression in DAG "etl" cannot use an empty task list'
        );
        expect(() => dag.parse`${a} >> ${[]}`).toThrow(
            'Wiring expression in DAG "etl" cannot use an empty task list'
        );
        expect(dag.tasks.size).toBe(0);
    });

    it("registers a wiring set longer than the static check limit", () => {
        const definitions = Array.from({ length: 42 }, (_, index) =>
            createTask(`t${String(index).padStart(2, "0")}`, {
                fn: () => index,
            })
        );

        const dag = createDAG("long").parse`${definitions}`;

        expect(dag.tasks.size).toBe(42);
        expect(dag.topologicalSort()).toHaveLength(42);
    });

    it("wires a chain longer than the static check limit", () => {
        const definitions = Array.from({ length: 42 }, (_, index) =>
            createTask(`t${String(index).padStart(2, "0")}`, {
                fn: () => index,
            })
        );

        const segments: string[] = [];
        const operands: TaskLike[] = [];

        for (const [index, definition] of definitions.entries()) {
            if (index > 0) {
                segments.push(" >> ");
            }

            operands.push(definition);
        }

        const dag = createDAG("long").parse(
            templateSegments(["", ...segments, ""]),
            ...operands
        );

        expect(dag.tasks.size).toBe(42);
        expect(namesOf(dag)).toStrictEqual(
            definitions.map((definition) => definition.id)
        );
    });

    it("requires a declared branch set to be routed completely", () => {
        const declared = branch("declared", {
            branches: ["us", "eu"],
            choose: () => "us" as const,
        });

        const us = createTask("us", { fn: () => "us" });

        const dag = createDAG("etl");

        expect(() => dag.parse`${declared} >> ${us}`).toThrow(
            'Branch "declared" must route to declared branch "eu"'
        );
        expect(dag.tasks.size).toBe(0);
    });
});

describe("parse wiring sets", () => {
    it("links each wiring set to the next and returns the DAG", () => {
        const dag = createDAG("example");
        const a = addTask(dag, { id: "A", fn: () => 0 });
        const b = addTask(dag, { id: "B", fn: () => 0 });
        const c = addTask(dag, { id: "C", fn: () => 0 });
        const d = addTask(dag, { id: "D", fn: () => 0 });
        const e = addTask(dag, { id: "E", fn: () => 0 });
        const f = addTask(dag, { id: "F", fn: () => 0 });
        const g = addTask(dag, { id: "G", fn: () => 0 });

        const wired = dag.parse`${a} >> ${[d, b]}`.parse`${d} >> ${e}`
            .parse`${b} >> ${[e, c, g]}`.parse`${c} >> ${g}`.parse`${e} >> ${f}`
            .parse`${g} >> ${f}`;

        const order = namesOf(dag);

        expect(wired).toBe(dag);
        expect([...a.downstream]).toStrictEqual([d, b]);
        expect([...b.downstream]).toStrictEqual([e, c, g]);
        expect(order[0]).toBe("A");
        expect(order.at(-1)).toBe("F");
    });

    it("registers a single operand without adding edges", () => {
        const dag = createDAG("single");
        const definition = createTask("only", { fn: () => 0 });

        expect(dag.parse`${definition}`).toBe(dag);

        expect(dag.getTask("only")?.id).toBe("only");
        expect(dag.getTask("only")?.downstream.size).toBe(0);
    });

    it("adds no edges for a single operand and skips repeated edges", () => {
        const dag = createDAG("chain");
        const first = addTask(dag, { id: "first", fn: () => 0 });
        const second = addTask(dag, { id: "second", fn: () => 0 });

        expect(dag.parse`${first}`).toBe(dag);

        expect(first.downstream.size).toBe(0);

        expect(
            dag.parse`${first} >> ${second}`.parse`${first} >> ${second}`
        ).toBe(dag);

        expect(first.downstream.size).toBe(1);
    });

    it("links a wiring set to the following operand", () => {
        const dag = createDAG("fan-in");
        const first = addTask(dag, { id: "first", fn: () => 0 });
        const second = addTask(dag, { id: "second", fn: () => 0 });
        const sink = addTask(dag, { id: "sink", fn: () => 0 });

        expect(dag.parse`${[first, second]} >> ${sink}`).toBe(dag);

        expect([...sink.upstream]).toStrictEqual([first, second]);
        expect([...first.downstream]).toStrictEqual([sink]);
        expect([...second.downstream]).toStrictEqual([sink]);
    });

    it("wires three tasks in one expression", () => {
        const dag = createDAG("linear");
        const first = addTask(dag, { id: "first", fn: () => 0 });
        const second = addTask(dag, { id: "second", fn: () => 0 });
        const third = addTask(dag, { id: "third", fn: () => 0 });

        expect(dag.parse`${first} >> ${second} >> ${third}`).toBe(dag);

        expect([...first.downstream]).toStrictEqual([second]);
        expect([...second.upstream]).toStrictEqual([first]);
        expect([...second.downstream]).toStrictEqual([third]);
        expect([...third.upstream]).toStrictEqual([second]);
    });

    it("wires a middle set between two tasks in one expression", () => {
        const dag = createDAG("grouped");
        const first = addTask(dag, { id: "first", fn: () => 0 });
        const second1 = addTask(dag, { id: "second1", fn: () => 0 });
        const second2 = addTask(dag, { id: "second2", fn: () => 0 });
        const third = addTask(dag, { id: "third", fn: () => 0 });

        expect(dag.parse`${first} >> ${[second1, second2]} >> ${third}`).toBe(
            dag
        );

        expect([...first.downstream]).toStrictEqual([second1, second2]);
        expect([...second1.downstream]).toStrictEqual([third]);
        expect([...second2.downstream]).toStrictEqual([third]);
        expect([...third.upstream]).toStrictEqual([second1, second2]);
    });

    it("keeps separate parse calls independent", () => {
        const a = createTask("a", { fn: () => 0 });
        const b = createTask("b", { fn: () => 0 });
        const c = createTask("c", { fn: () => 0 });
        const d = createTask("d", { fn: () => 0 });

        const dag = createDAG("etl");

        expect(dag.parse`${a} >> ${b}`.parse`${c} >> ${d}`).toBe(dag);

        expect(downstreamNames(dag)).toStrictEqual({
            a: ["b"],
            b: [],
            c: ["d"],
            d: [],
        });
    });

    it("links every pair across three sets in one expression", () => {
        const dag = createDAG("matrix");
        const a1 = addTask(dag, { id: "a1", fn: () => 0 });
        const a2 = addTask(dag, { id: "a2", fn: () => 0 });
        const b1 = addTask(dag, { id: "b1", fn: () => 0 });
        const b2 = addTask(dag, { id: "b2", fn: () => 0 });
        const c1 = addTask(dag, { id: "c1", fn: () => 0 });
        const c2 = addTask(dag, { id: "c2", fn: () => 0 });

        expect(dag.parse`${[a1, a2]} >> ${[b1, b2]} >> ${[c1, c2]}`).toBe(dag);

        expect(downstreamNames(dag)).toStrictEqual({
            a1: ["b1", "b2"],
            a2: ["b1", "b2"],
            b1: ["c1", "c2"],
            b2: ["c1", "c2"],
            c1: [],
            c2: [],
        });
    });

    it("wires a fan-out and fan-in graph in one expression", () => {
        const { dag } = buildComplexDag();

        expect(downstreamNames(dag)).toStrictEqual({
            cleanA: ["join"],
            cleanB: ["join"],
            extract: ["cleanA", "cleanB"],
            join: ["validate"],
            publish: [],
            validate: ["publish"],
        });
    });

    it("rejects a cycle spanning multiple wiring sets", () => {
        const dag = createDAG("cycle");
        const first = addTask(dag, { id: "first", fn: () => 0 });
        const second = addTask(dag, { id: "second", fn: () => 0 });
        const third = addTask(dag, { id: "third", fn: () => 0 });

        expect(dag.parse`${first} >> ${second}`).toBe(dag);

        expect(() => dag.parse`${second} >> ${third} >> ${first}`).toThrow(
            'Dependency "third" -> "first" creates a cycle'
        );
        expect(second.downstream.size).toBe(0);
        expect(third.upstream.size).toBe(0);
        expect(third.downstream.size).toBe(0);
    });

    it("rolls back tasks registered by a failed parse", () => {
        const dag = createDAG("cycle");
        const first = addTask(dag, { id: "first", fn: () => 0 });
        const second = addTask(dag, { id: "second", fn: () => 0 });
        const third = createTask("third", { fn: () => 0 });

        expect(dag.parse`${first} >> ${second}`).toBe(dag);

        expect(() => dag.parse`${second} >> ${third} >> ${first}`).toThrow(
            'Dependency "third" -> "first" creates a cycle'
        );
        expect(dag.getTask("third")).toBeUndefined();
        expect([...dag.tasks.keys()]).toStrictEqual(["first", "second"]);
        expect(second.downstream.size).toBe(0);
    });

    it("rejects tasks from another DAG inside wiring sets", () => {
        const dag = createDAG("etl");
        const first = addTask(dag, { id: "first", fn: () => 0 });
        const other = createDAG("other");
        const outsider = addTask(other, { id: "outsider", fn: () => 0 });

        expect(() => dag.parse`${[first]} >> ${[outsider]}`).toThrow(
            "Both tasks must belong to this DAG"
        );
    });

    it("deduplicates a task repeated inside one set", () => {
        const dag = createDAG("duplicate-group");
        const first = addTask(dag, { id: "first", fn: () => 0 });
        const second = addTask(dag, { id: "second", fn: () => 0 });

        expect(dag.parse`${[first, first]} >> ${second}`).toBe(dag);

        expect([...first.downstream]).toStrictEqual([second]);
    });
});

describe("DAG integration", () => {
    it("registers every task kind and serializes its metadata", () => {
        const dag = createDAG("kinds")
            .parse`${createTask("extract", { fn: () => "raw" })} >> ${sensor("ready", { predicate: () => true, pokeIntervalMs: 5000 })} >> ${delay("wait", { durationMs: 25 })} >> ${branch("route", { choose: () => "left" })} >> ${shortCircuit("gate", { condition: () => true })} >> ${trigger("start", { dagId: "child", waitForCompletion: true })}`;

        expect(
            dag.topologicalSort().map((registered) => registered.kind)
        ).toStrictEqual([
            TASK_KIND_ENUM.Task,
            TASK_KIND_ENUM.Sensor,
            TASK_KIND_ENUM.Delay,
            TASK_KIND_ENUM.Branch,
            TASK_KIND_ENUM.ShortCircuit,
            TASK_KIND_ENUM.Trigger,
        ]);

        expect(dag.toJSON().tasks).toStrictEqual([
            expect.objectContaining({
                kind: TASK_KIND_ENUM.Task,
                id: "extract",
            }),
            expect.objectContaining({
                kind: TASK_KIND_ENUM.Sensor,
                id: "ready",
                pokeIntervalMs: 5000,
            }),
            expect.objectContaining({
                kind: TASK_KIND_ENUM.Delay,
                id: "wait",
                durationMs: 25,
            }),
            expect.objectContaining({
                kind: TASK_KIND_ENUM.Branch,
                id: "route",
            }),
            expect.objectContaining({
                kind: TASK_KIND_ENUM.ShortCircuit,
                id: "gate",
            }),
            expect.objectContaining({
                kind: TASK_KIND_ENUM.Trigger,
                id: "start",
                dagId: "child",
                waitForCompletion: true,
            }),
        ]);

        const encoded = JSON.stringify(dag);

        expect(encoded).not.toContain('"predicate"');
        expect(encoded).not.toContain('"choose"');
        expect(encoded).not.toContain('"condition"');
    });

    it("omits an absent sensor interval from JSON", () => {
        const dag = createDAG("kinds")
            .parse`${sensor("ready", { predicate: () => true })}`;

        expect(dag.toJSON().tasks[0]).not.toHaveProperty("pokeIntervalMs");
    });

    it("snapshots every registered kind through DAGTask.toJSON()", () => {
        const dag = createDAG("kinds")
            .parse`${createTask("extract", { fn: () => "raw" })} >> ${sensor("ready", { predicate: () => true, pokeIntervalMs: 5000 })} >> ${delay("wait", { durationMs: 25 })} >> ${branch("route", { choose: () => "left" })} >> ${shortCircuit("gate", { condition: () => true })} >> ${trigger("start", { dagId: "child", waitForCompletion: true })}`;

        const snapshots = dag
            .topologicalSort()
            .map((registered) => registered.toJSON());

        // A handle and its DAG entry are the same snapshot, kind fields included.
        expect(snapshots).toStrictEqual(dag.toJSON().tasks);
    });

    it("rejects reusing one id across kinds", () => {
        const definitions = [
            createTask("shared", { fn: () => 0 }),
            sensor("shared", { predicate: () => true }),
            delay("shared", { durationMs: 1 }),
            branch("shared", { choose: () => "left" }),
            shortCircuit("shared", { condition: () => true }),
            trigger("shared", { dagId: "child" }),
        ];

        expect(() => createDAG("ids").parse`${definitions}`).toThrow(
            /already exists in DAG "ids" with different behavior/u
        );
    });

    // The id is declared by the definition, so it is the same in every DAG.
    it("reuses one definition's task id across DAGs for every kind", () => {
        const definitions = [
            createTask("extract", { fn: () => 0 }),
            sensor("ready", { predicate: () => true }),
            delay("wait", { durationMs: 1 }),
            branch("route", { choose: () => "left" }),
            shortCircuit("gate", { condition: () => true }),
            trigger("start", { dagId: "child" }),
        ];

        const first = createDAG("first").parse`${definitions}`;
        const second = createDAG("second").parse`${definitions}`;

        expect(first.tasks.size).toBe(6);
        expect(second.tasks.size).toBe(6);

        for (const definition of definitions) {
            expect(first.getTask(definition.id)).toBeDefined();
            expect(second.getTask(definition.id)).toBeDefined();
        }
    });

    it("chains mixed kinds and records kind-agnostic edges", () => {
        const dag = createDAG("mixed")
            .parse`${createTask("extract", { fn: () => "raw" })} >> ${sensor("ready", { predicate: () => true })} >> ${delay("wait", { durationMs: 25 })} >> ${shortCircuit("gate", { condition: () => true })} >> ${trigger("start", { dagId: "child" })}`;

        expect(dag.topologicalSort().map(({ id }) => id)).toStrictEqual([
            "extract",
            "ready",
            "wait",
            "gate",
            "start",
        ]);

        expect(
            dag.toJSON().tasks.map(({ upstream }) => upstream)
        ).toStrictEqual([[], ["extract"], ["ready"], ["wait"], ["gate"]]);
    });

    it("wires a fan-out and fan-in across different kinds", () => {
        const gate = shortCircuit("gate", { condition: () => true });
        const route = branch("route", { choose: () => "left" });
        const start = trigger("start", { dagId: "child" });

        const dag = createDAG("fan")
            .parse`${createTask("extract", { fn: () => 0 })} >> ${[gate, route]} >> ${start}`;

        const extract = dag.getTask("extract");

        const downstream = [...(extract?.downstream ?? [])].map(({ id }) => id);

        expect(downstream).toStrictEqual(["gate", "route"]);
        expect(
            [...(dag.getTask("start")?.upstream ?? [])].map(({ id }) => id)
        ).toStrictEqual(["gate", "route"]);
    });
});

describe("async task functions", () => {
    it("executes async task functions in topological order", async () => {
        const visited: string[] = [];

        const extract = createTask("extract", {
            fn: async (ctx) => {
                visited.push(ctx.id);

                return "raw";
            },
        });

        const transform = createTask("transform", {
            fn: async (ctx) => {
                visited.push(ctx.id);

                return "clean";
            },
        });

        const load = createTask("load", {
            fn: async (ctx) => {
                visited.push(ctx.id);

                return "stored";
            },
        });

        const dag = createDAG("etl");

        expect(dag.parse`${extract} >> ${transform} >> ${load}`).toBe(dag);

        for (const task of dag.topologicalSort()) {
            const { definition } = task;

            if (definition.kind !== TASK_KIND_ENUM.Task) {
                throw new Error(
                    `Expected a regular task, got ${definition.kind}`
                );
            }

            // oxlint-disable-next-line no-await-in-loop -- dependency order requires sequential execution.
            await definition.fn({
                id: task.id,
                payload: undefined,
            });
        }

        expect(visited).toStrictEqual(["extract", "transform", "load"]);
    });
});
