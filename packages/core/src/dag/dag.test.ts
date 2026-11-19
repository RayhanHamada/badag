import { describe, expect, expectTypeOf, it } from "vitest";

import type { TaskContext, TaskFn } from "../task/base";
import { TASK_KIND_ENUM } from "../task/kind";
import { task as createTask } from "../task/task";
import type { TaskParamInput, TaskParamOutput } from "../task/task";
import { DEFAULT_TRIGGER_RULE, TRIGGER_RULE_ENUM } from "../task/trigger-rule";
import { createDAG, DAG } from "./dag";
import { DAGTask } from "./registered-task";
import { DAG_VIOLATION_ENUM } from "./violation";

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

function requireTask(dag: DAG, id: string): DAGTask {
    const task = dag.getTask(id);

    if (task === undefined) {
        throw new Error(`Task "${id}" was not registered`);
    }

    return task;
}

const rawFn = (): string => "raw";

// Captures its argument, so reusing the factory yields distinct callbacks.
const syncTableFn = (table: string) => () => table;

// Callback identity is reference-based, so duplicate definitions must share it.
const contextFn = (ctx: TaskContext<"scaled">) => ctx.id;

describe("DAG construction", () => {
    it("keeps a valid Airflow DAG id verbatim", () => {
        expect(createDAG("etl").dagId).toBe("etl");
        expect(createDAG("daily-pricing.v2_beta").dagId).toBe(
            "daily-pricing.v2_beta"
        );
    });

    it("stores empty and whitespace-only DAG ids verbatim", () => {
        expect(createDAG("").dagId).toBe("");
        expect(createDAG("   ").dagId).toBe("   ");
    });

    it("reports empty and whitespace-only DAG ids through validate()", () => {
        for (const dagId of ["", "   "]) {
            expect(createDAG(dagId).validate()).toStrictEqual([
                {
                    code: DAG_VIOLATION_ENUM.InvalidDagId,
                    message: "DAG id cannot be empty",
                    subjects: [dagId],
                },
            ]);
        }
    });

    it("reports ids outside the Airflow dag_id convention", () => {
        for (const dagId of [
            "  etl  ",
            "etl pricing",
            "etl/pricing",
            "etl*",
            "etl?run",
        ]) {
            expect(createDAG(dagId).validate()).toStrictEqual([
                {
                    code: DAG_VIOLATION_ENUM.InvalidDagId,
                    message: `DAG id "${dagId}" must use letters, numbers, ".", "-", or "_"`,
                    subjects: [dagId],
                },
            ]);
        }
    });

    it("reports DAG ids longer than 250 characters", () => {
        const dagId = "a".repeat(251);

        expect(createDAG(dagId).validate()).toStrictEqual([
            {
                code: DAG_VIOLATION_ENUM.InvalidDagId,
                message: `DAG id "${dagId}" must be at most 250 characters`,
                subjects: [dagId],
            },
        ]);
        expect(createDAG("a".repeat(250)).validate()).toStrictEqual([]);
    });

    it("builds the same DAG through createDAG", () => {
        const dag = createDAG("etl");

        expect(dag).toBeInstanceOf(DAG);
        expect(dag.dagId).toBe("etl");
        expectTypeOf(dag).toEqualTypeOf<DAG<"etl">>();
        expectTypeOf(dag.getTask("extract")).toEqualTypeOf<
            DAGTask<"extract"> | undefined
        >();

        const wired = dag.parse`${createTask("extract", { fn: () => "raw" })}`;

        expect(wired).toBe(dag);
        expect(dag.topologicalSort().map((task) => task.id)).toStrictEqual([
            "extract",
        ]);
    });

    it("stores DAG metadata and defaults to an empty object", () => {
        const metadata = { description: "Nightly pricing" };
        const dag = createDAG("etl", metadata);

        expect(dag.metadata).toStrictEqual(metadata);
        expect(createDAG("etl").metadata).toStrictEqual({});
        expect(new DAG("etl", metadata).metadata).toStrictEqual(metadata);
    });
});

describe("DAG registration", () => {
    it("rejects task id collisions", () => {
        const dag = createDAG("etl");

        addTask(dag, { id: "extract", fn: () => "raw" });

        expect(() =>
            addTask(dag, { id: "extract", fn: () => "clean" })
        ).toThrow(/already exists/u);
    });

    it("treats an identical definition as already registered", () => {
        const dag = createDAG("etl");
        const definition = createTask("extract", { fn: () => "raw" });

        expect(dag.parse`${definition}`.parse`${definition}`).toBe(dag);

        expect(dag.tasks.size).toBe(1);
    });

    it("keeps the first registration's metadata for a duplicate definition", () => {
        const dag = createDAG("etl");

        const first = createTask("extract", {
            fn: rawFn,
            config: { timeout_ms: 1000 },
        });

        const second = createTask("extract", {
            fn: rawFn,
            description: "second registration",
            config: { timeout_ms: 9999 },
            triggerRule: TRIGGER_RULE_ENUM.OneFailed,
        });

        expect(dag.parse`${first}`.parse`${second}`).toBe(dag);

        const registered = requireTask(dag, "extract");

        expect(dag.tasks.size).toBe(1);
        expect(registered.config).toStrictEqual({ timeout_ms: 1000 });
        expect(registered.description).toBeUndefined();
        expect(registered.triggerRule).toBe(DEFAULT_TRIGGER_RULE);
    });

    it("rejects a same-id definition that differs only by captured value", () => {
        const dag = createDAG("warehouse");

        expect(
            dag.parse`${createTask("sync", { fn: syncTableFn("customers") })}`
        ).toBe(dag);

        expect(
            () =>
                dag.parse`${createTask("sync", { fn: syncTableFn("orders") })}`
        ).toThrow(/different behavior/u);

        // The rejected registration leaves the graph untouched.
        const registered = requireTask(dag, "sync");
        const { definition } = registered;

        expect(dag.tasks.size).toBe(1);

        if (definition.kind !== TASK_KIND_ENUM.Task) {
            throw new Error(`Expected a regular task, got ${definition.kind}`);
        }

        expect(
            definition.fn({
                id: registered.id,
                payload: undefined,
            })
        ).toBe("customers");
    });

    it("accepts the surviving definition after rejecting a capture-only duplicate", () => {
        const definition = createTask("sync", {
            fn: syncTableFn("customers"),
        });

        const dag = createDAG("recovery");

        expect(dag.parse`${definition}`).toBe(dag);

        expect(
            () =>
                dag.parse`${createTask("sync", { fn: syncTableFn("orders") })}`
        ).toThrow(/different behavior/u);

        expect(() => dag.parse`${definition}`).not.toThrow();
        expect(dag.tasks.size).toBe(1);
    });

    it("rejects a capture-only duplicate introduced through a handle", () => {
        const dag = createDAG("wiring");

        const sync = addTask(dag, {
            id: "sync",
            fn: syncTableFn("customers"),
        });

        const load = addTask(dag, { id: "load", fn: rawFn });

        sync.setDownstream(load);

        expect(() =>
            sync.setDownstream(
                createTask("sync", { fn: syncTableFn("orders") })
            )
        ).toThrow(/different behavior/u);

        expect(dag.tasks.size).toBe(2);
        expect([...sync.downstream]).toStrictEqual([load]);
    });

    it("rejects edges that cross DAG boundaries", () => {
        const dag = createDAG("etl");
        const other = createDAG("other");
        const task = addTask(dag, { id: "extract", fn: () => "raw" });
        const outsider = addTask(other, { id: "load", fn: () => "stored" });

        expect(() => task.setDownstream(outsider)).toThrow(
            /belong to this DAG/u
        );
    });

    it("rejects same-DAG handles that are not registered", () => {
        const dag = createDAG("etl");
        const definition = createTask("extract", { fn: () => "raw" });
        const unregistered = new DAGTask(dag, definition);
        const registered = addTask(dag, { id: "load", fn: () => "stored" });

        expect(() => unregistered.setDownstream(registered)).toThrow(
            "Both tasks must belong to this DAG"
        );
        expect(registered.upstream.size).toBe(0);
    });

    it("does not expose a raw edge-insertion method", () => {
        const dag = createDAG("etl");
        const task = addTask(dag, { id: "extract", fn: () => 0 });

        expect("connectTo" in task).toBeFalsy();
    });

    it("registers definitions across fluent parse calls", () => {
        const dag = createDAG("etl");
        const first = createTask("first", { fn: () => 0 });
        const second = createTask("second", { fn: () => 0 });

        const wired = dag.parse`${first}`.parse`${second}`;

        expect(wired).toBe(dag);
        expect([...dag.tasks.keys()]).toStrictEqual(["first", "second"]);
    });

    it("registers a batch atomically", () => {
        const dag = createDAG("etl");
        const first = createTask("first", { fn: () => 0 });
        const duplicate = createTask("first", { fn: () => 1 });

        expect(() => dag.parse`${[first, duplicate]}`).toThrow(
            /already exists/u
        );
        expect(dag.tasks.size).toBe(0);
    });

    it("accepts context callbacks", () => {
        const definition = createTask("scaled", { fn: contextFn });

        const definition2 = createTask("scaled", { fn: contextFn });

        const dag = createDAG("etl");

        expect(dag.parse`${definition}`).toBe(dag);
        expect(dag.parse`${definition2}`).toBe(dag);

        requireTask(dag, "scaled");

        expect(
            definition.fn({
                id: definition.id,
                payload: undefined,
            })
        ).toBe("scaled");
    });

    it("registers a prebuilt definition under its id", () => {
        const dag = createDAG("etl");
        const definition = createTask("extract", { fn: () => "raw" });
        const handle = register(dag, definition);

        expect(handle.id).toBe("extract");
        expect(dag.getTask("extract")).toBe(handle);
        expect(dag.tasks.get("extract")).toBe(handle);
        expect([...dag.tasks.keys()]).toStrictEqual(["extract"]);
    });

    it("allows one definition in multiple DAGs", () => {
        const definition = createTask("extract", { fn: () => "raw" });
        const first = register(createDAG("first"), definition);
        const second = register(createDAG("second"), definition);

        expect(first).not.toBe(second);
        expect(first.id).toBe(second.id);
    });

    it("returns undefined for unknown ids", () => {
        const dag = createDAG("etl");

        addTask(dag, { id: "extract", fn: () => "raw" });

        expect(dag.getTask("load")).toBeUndefined();
    });

    it("stores config on the task by reference", () => {
        const config = { timeout_ms: 500, retries: 2 };
        const dag = createDAG("etl");
        const task = addTask(dag, { id: "extract", fn: () => 0, config });

        expect(task.config).toBe(config);
    });
});

describe("dependency edges", () => {
    it("links every task in an upstream list", () => {
        const dag = createDAG("etl");
        const first = addTask(dag, { id: "first", fn: () => 0 });
        const second = addTask(dag, { id: "second", fn: () => 0 });
        const sink = addTask(dag, { id: "sink", fn: () => 0 });

        sink.setUpstream([first, second]);

        expect([...sink.upstream]).toStrictEqual([first, second]);
        expect([...first.downstream]).toStrictEqual([sink]);
        expect([...second.downstream]).toStrictEqual([sink]);
    });

    it("rejects self dependencies on the upstream side", () => {
        const dag = createDAG("etl");
        const task = addTask(dag, { id: "task", fn: () => 0 });

        expect(() => task.setUpstream(task)).toThrow(
            "A task cannot depend on itself"
        );
    });

    it("rejects edges whose upstream task belongs to another DAG", () => {
        const dag = createDAG("etl");
        const other = createDAG("other");
        const task = addTask(dag, { id: "extract", fn: () => 0 });
        const outsider = addTask(other, { id: "load", fn: () => 0 });

        expect(() => outsider.setDownstream(task)).toThrow(
            "Both tasks must belong to this DAG"
        );
    });

    it("rejects a deep cycle without recording the rejected edge", () => {
        const dag = createDAG("etl");
        const first = addTask(dag, { id: "first", fn: () => 0 });
        const second = addTask(dag, { id: "second", fn: () => 0 });
        const third = addTask(dag, { id: "third", fn: () => 0 });

        first.setDownstream(second);
        second.setDownstream(third);

        expect(() => third.setDownstream(first)).toThrow(
            'Dependency "third" -> "first" creates a cycle'
        );
        expect(third.downstream.size).toBe(0);
        expect(first.upstream.size).toBe(0);
    });

    it("registers and wires definitions in one parse call", () => {
        const dag = createDAG("etl");
        const first = createTask("first", { fn: () => 0 });
        const second = createTask("second", { fn: () => 0 });

        expect(dag.parse`${first} >> ${second}`).toBe(dag);

        const upstream = dag.getTask("first");
        const downstream = dag.getTask("second");

        expect([...(upstream?.downstream ?? [])]).toStrictEqual([downstream]);
        expect([...(downstream?.upstream ?? [])]).toStrictEqual([upstream]);
    });

    it("registers definitions passed to edge methods", () => {
        const dag = createDAG("etl");
        const first = register(dag, createTask("first", { fn: () => 0 }));
        const second = createTask("second", { fn: () => 0 });

        first.setDownstream(second);

        expect(dag.tasks.size).toBe(2);
        expect([...(dag.getTask("second")?.upstream ?? [])]).toStrictEqual([
            first,
        ]);
    });

    it("registers definitions passed to addDependency", () => {
        const dag = createDAG("etl");
        const first = createTask("first", { fn: () => 0 });
        const second = createTask("second", { fn: () => 0 });

        dag.addDependency(first, second);

        const firstTask = dag.getTask("first");
        const secondTask = dag.getTask("second");

        expect([...(firstTask?.downstream ?? [])]).toStrictEqual([secondTask]);
    });

    it("links every pair through addDependencies", () => {
        const dag = createDAG("etl");
        const first = addTask(dag, { id: "first", fn: () => 0 });
        const second = addTask(dag, { id: "second", fn: () => 0 });
        const sink = addTask(dag, { id: "sink", fn: () => 0 });

        dag.addDependencies([first, second], sink);

        expect([...first.downstream]).toStrictEqual([sink]);
        expect([...second.downstream]).toStrictEqual([sink]);
        expect([...sink.upstream]).toStrictEqual([first, second]);
    });

    it("keeps a failed upstream batch unchanged", () => {
        const dag = createDAG("etl");
        const first = addTask(dag, { id: "first", fn: () => 0 });
        const second = addTask(dag, { id: "second", fn: () => 0 });
        const sink = addTask(dag, { id: "sink", fn: () => 0 });

        sink.setDownstream(second);

        expect(() => sink.setUpstream([first, second])).toThrow(
            /creates a cycle/u
        );
        expect(first.downstream.size).toBe(0);
        expect(sink.upstream.size).toBe(0);
        expect(second.downstream.has(sink)).toBeFalsy();
    });

    it("keeps a failed downstream batch unchanged", () => {
        const dag = createDAG("etl");
        const first = addTask(dag, { id: "first", fn: () => 0 });
        const second = addTask(dag, { id: "second", fn: () => 0 });
        const sink = addTask(dag, { id: "sink", fn: () => 0 });

        sink.setDownstream(second);

        expect(() => second.setDownstream([first, sink])).toThrow(
            /creates a cycle/u
        );
        expect(second.downstream.size).toBe(0);
        expect(first.upstream.size).toBe(0);
        expect(sink.upstream.has(second)).toBeFalsy();
    });

    it("rolls back definitions registered by a failed edge batch", () => {
        const dag = createDAG("etl");
        const second = addTask(dag, { id: "second", fn: () => 0 });
        const sink = addTask(dag, { id: "sink", fn: () => 0 });
        const fresh = createTask("fresh", { fn: () => 0 });

        sink.setDownstream(second);

        expect(() => sink.setUpstream([fresh, second])).toThrow(
            /creates a cycle/u
        );
        expect(dag.getTask("fresh")).toBeUndefined();
        expect(sink.upstream.size).toBe(0);
    });
});
