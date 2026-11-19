import { describe, expect, it } from "vitest";

import type { TaskFn } from "../task/base";
import { TASK_KIND_ENUM } from "../task/kind";
import { task as createTask } from "../task/task";
import type { TaskParamInput, TaskParamOutput } from "../task/task";
import { DEFAULT_TRIGGER_RULE, TRIGGER_RULE_ENUM } from "../task/trigger-rule";
import { createDAG } from "./dag";
import type { DAG } from "./dag";
import type { DAGTask } from "./registered-task";

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

describe("JSON representation", () => {
    it("returns an empty task list for an empty DAG", () => {
        expect(createDAG("empty").toJSON()).toStrictEqual({
            dagId: "empty",
            tasks: [],
        });
    });

    it("includes the DAG description when present", () => {
        expect(
            createDAG("etl", { description: "Nightly pricing" }).toJSON()
        ).toStrictEqual({
            dagId: "etl",
            description: "Nightly pricing",
            tasks: [],
        });
    });

    it("serializes tasks and edges by name", () => {
        const dag = createDAG("etl");

        const extract = addTask(dag, {
            id: "extract",
            fn: () => "raw",
            triggerRule: TRIGGER_RULE_ENUM.AllDone,
            config: { timeout_ms: 100 },
        });

        const transform = addTask(dag, {
            id: "transform",
            fn: () => "clean",
        });

        const load = addTask(dag, { id: "load", fn: () => "stored" });

        extract.setDownstream(transform);
        transform.setDownstream(load);

        expect(dag.toJSON()).toStrictEqual({
            dagId: "etl",
            tasks: [
                {
                    id: "extract",
                    kind: TASK_KIND_ENUM.Task,
                    triggerRule: TRIGGER_RULE_ENUM.AllDone,
                    config: { timeout_ms: 100 },
                    upstream: [],
                    downstream: ["transform"],
                },
                {
                    id: "transform",
                    kind: TASK_KIND_ENUM.Task,
                    triggerRule: TRIGGER_RULE_ENUM.AllSuccess,
                    upstream: ["extract"],
                    downstream: ["load"],
                },
                {
                    id: "load",
                    kind: TASK_KIND_ENUM.Task,
                    triggerRule: TRIGGER_RULE_ENUM.AllSuccess,
                    upstream: ["transform"],
                    downstream: [],
                },
            ],
        });
    });

    it("omits config when it is missing", () => {
        const dag = createDAG("etl");
        addTask(dag, { id: "extract", fn: () => 0 });

        expect(dag.toJSON().tasks[0]).toStrictEqual({
            id: "extract",
            kind: TASK_KIND_ENUM.Task,
            triggerRule: TRIGGER_RULE_ENUM.AllSuccess,
            upstream: [],
            downstream: [],
        });
    });

    it("drops functions from the encoded form", () => {
        const dag = createDAG("etl");
        addTask(dag, { id: "extract", fn: () => "raw" });

        const encoded = JSON.stringify(dag);

        expect(encoded).not.toContain('"fn"');
        expect(encoded).toBe(JSON.stringify(dag.toJSON()));
    });

    it("serializes a task handle like the same task's DAG entry", () => {
        const dag = createDAG("etl");
        const extract = addTask(dag, { id: "extract", fn: () => "raw" });

        const load = addTask(dag, {
            id: "load",
            fn: () => "stored",
            description: "Write the result",
            config: { retries: 2 },
            triggerRule: TRIGGER_RULE_ENUM.AllDone,
        });

        extract.setDownstream(load);

        expect(extract.toJSON()).toStrictEqual(dag.toJSON().tasks[0]);
        expect(load.toJSON()).toStrictEqual(dag.toJSON().tasks[1]);
    });

    it("stringifies a task handle through toJSON", () => {
        const dag = createDAG("etl");
        const extract = addTask(dag, { id: "extract", fn: () => "raw" });

        const encoded = JSON.stringify(extract);

        expect(encoded).not.toContain('"fn"');
        expect(encoded).toBe(JSON.stringify(extract.toJSON()));
        expect(encoded).toBe(JSON.stringify(dag.toJSON().tasks[0]));
    });

    it("serializes a fan-out and fan-in graph built in one call", () => {
        const { dag } = buildComplexDag();

        expect(dag.toJSON()).toStrictEqual({
            dagId: "complex",
            tasks: [
                {
                    id: "extract",
                    kind: TASK_KIND_ENUM.Task,
                    triggerRule: DEFAULT_TRIGGER_RULE,
                    description: "Read source data",
                    upstream: [],
                    downstream: ["cleanA", "cleanB"],
                },
                {
                    id: "cleanA",
                    kind: TASK_KIND_ENUM.Task,
                    triggerRule: DEFAULT_TRIGGER_RULE,
                    upstream: ["extract"],
                    downstream: ["join"],
                },
                {
                    id: "cleanB",
                    kind: TASK_KIND_ENUM.Task,
                    triggerRule: DEFAULT_TRIGGER_RULE,
                    upstream: ["extract"],
                    downstream: ["join"],
                },
                {
                    id: "join",
                    kind: TASK_KIND_ENUM.Task,
                    triggerRule: DEFAULT_TRIGGER_RULE,
                    upstream: ["cleanA", "cleanB"],
                    downstream: ["validate"],
                },
                {
                    id: "validate",
                    kind: TASK_KIND_ENUM.Task,
                    triggerRule: DEFAULT_TRIGGER_RULE,
                    upstream: ["join"],
                    downstream: ["publish"],
                },
                {
                    id: "publish",
                    kind: TASK_KIND_ENUM.Task,
                    triggerRule: DEFAULT_TRIGGER_RULE,
                    upstream: ["validate"],
                    downstream: [],
                },
            ],
        });
    });
});
