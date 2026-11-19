import { describe, expect, expectTypeOf, it } from "vitest";

import { createDAG } from "../dag/dag";
import type { DAG } from "../dag/dag";
import type { DAGTask } from "../dag/registered-task";
import type { TaskContext, TaskFn } from "./base";
import { task as createTask } from "./task";
import type { TaskParamOutput } from "./task";
import { DEFAULT_TRIGGER_RULE, TRIGGER_RULE_ENUM } from "./trigger-rule";

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

describe("task definitions", () => {
    it("trims task ids and passes them through context", () => {
        const definition = createTask("  my-task_name  ", {
            fn: (ctx) => ctx.id,
        });

        expect(definition.id).toBe("my-task_name");
        expectTypeOf(definition.id).toEqualTypeOf<"my-task_name">();
        expect(
            definition.fn({
                id: "my-task_name",
                payload: undefined,
            })
        ).toBe("my-task_name");
    });

    it("carries the declared id on definitions and handles", () => {
        const definition = createTask("extract", { fn: () => "raw" });

        expect(definition.id).toBe("extract");

        const handle = register(createDAG("etl"), definition);

        expect(handle.id).toBe("extract");
    });

    it("preserves an optional task description", () => {
        const definition = createTask("extract", {
            fn: () => "raw",
            description: "Read source data",
        });

        const handle = register(createDAG("etl"), definition);

        expect(definition.description).toBe("Read source data");
        expect(handle.description).toBe("Read source data");
    });

    it("leaves task descriptions undefined when omitted", () => {
        const definition = createTask("extract", { fn: () => "raw" });
        const handle = register(createDAG("etl"), definition);

        expect(definition.description).toBeUndefined();
        expect(handle.description).toBeUndefined();
    });

    it("accepts Airflow task ids with dots, separators, and unicode", () => {
        for (const name of [
            "my.task",
            "my--task",
            "my__task",
            "-task",
            "task-",
            "_task",
            "task.",
            "extract.users_daily-v2",
            "ünïcode_task",
        ]) {
            expect(() => createTask(name, { fn: () => 0 })).not.toThrow();
        }
    });

    it("rejects task ids outside the Airflow task_id convention", () => {
        for (const name of [
            "my task",
            "my/task",
            "my:task",
            "task!",
            "task,",
        ]) {
            expect(() => createTask(name, { fn: () => 0 })).toThrow(
                /must use letters, numbers, "\.", "-", or "_"/u
            );
        }
    });

    it("caps task ids at Airflow's 250-character limit", () => {
        expect(() =>
            createTask("a".repeat(250), { fn: () => 0 })
        ).not.toThrow();
        expect(() => createTask("a".repeat(251), { fn: () => 0 })).toThrow(
            /must be at most 250 characters/u
        );
    });

    it("rejects empty task ids after trimming", () => {
        expect(() => createTask("   ", { fn: () => 0 })).toThrow(
            "Task ID cannot be empty"
        );
    });

    it("validates ids on manually constructed definitions", () => {
        const definition = createTask("extract", { fn: () => "raw" });
        const spacedId = { ...definition, id: "extract task" };
        const longId = { ...definition, id: "a".repeat(251) };

        expect(() => createDAG("etl").parse`${spacedId}`).toThrow(
            /must use letters, numbers, "\.", "-", or "_"/u
        );
        expect(() => createDAG("etl").parse`${longId}`).toThrow(
            /must be at most 250 characters/u
        );
    });

    it("defaults the trigger rule to all_success", () => {
        const definition = createTask("extract", { fn: () => "raw" });
        const dag = createDAG("etl");

        expect(dag.parse`${definition}`).toBe(dag);

        expect(definition.triggerRule).toBe(DEFAULT_TRIGGER_RULE);
        expect(dag.getTask("extract")?.triggerRule).toBe(DEFAULT_TRIGGER_RULE);
    });

    it("keeps an explicit trigger rule", () => {
        const definition = createTask("extract", {
            fn: () => "raw",
            triggerRule: TRIGGER_RULE_ENUM.OneFailed,
        });

        const dag = createDAG("etl");

        expect(dag.parse`${definition}`).toBe(dag);

        expect(definition.triggerRule).toBe(TRIGGER_RULE_ENUM.OneFailed);
        expect(dag.getTask("extract")?.triggerRule).toBe(
            TRIGGER_RULE_ENUM.OneFailed
        );
    });

    it("keeps the context-aware function signature on the definition", () => {
        const definition = createTask("double", {
            fn: (ctx) => ctx.id.length * 2,
        });

        expectTypeOf(definition.fn).toEqualTypeOf<
            (ctx: TaskContext<"double">) => number
        >();
        expect(
            definition.fn({
                id: "double",
                payload: undefined,
            })
        ).toBe(12);
    });

    it("keeps literal task ids in lookups", () => {
        const dag = createDAG("etl");
        const definition = createTask("extract", { fn: () => "raw" });

        expect(dag.parse`${definition}`).toBe(dag);

        const found = dag.getTask("extract");

        expectTypeOf(definition.id).toEqualTypeOf<"extract">();
        expectTypeOf(found).toEqualTypeOf<DAGTask<"extract"> | undefined>();
        expect(found?.id).toBe("extract");
    });
});

describe("async task functions", () => {
    it("preserves the async signature and resolves the result", async () => {
        const definition = createTask("extract", {
            fn: async (ctx) => `${ctx.id}-raw`,
        });

        expectTypeOf(definition.fn).toEqualTypeOf<
            (ctx: TaskContext<"extract">) => Promise<string>
        >();

        await expect(
            definition.fn({
                id: "extract",
                payload: undefined,
            })
        ).resolves.toBe("extract-raw");
    });

    it("propagates a rejection from the async function", async () => {
        const failure = new Error("extract failed");

        const definition = createTask("extract", {
            fn: async () => {
                throw failure;
            },
        });

        await expect(definition.fn()).rejects.toBe(failure);
    });
});
