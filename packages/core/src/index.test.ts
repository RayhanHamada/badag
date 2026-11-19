import { describe, expect, expectTypeOf, it } from "vitest";

import {
    branch,
    createDAG,
    DAG,
    DAG_VIOLATION_ENUM,
    delay,
    sensor,
    shortCircuit,
    task as createTask,
    TASK_KIND_ENUM,
    trigger,
    TRIGGER_RULE_ENUM,
} from "./index";
import type {
    DAGJson,
    DAGMetadata,
    DAGTask,
    TaskConfig,
    TaskContext,
    TaskFn,
    TaskJson,
    TaskLike,
    TaskOrTasks,
    TaskParamInput,
    TaskParamOutput,
    TriggerRule,
} from "./index";

const createInvalidTriggerRule = () =>
    createTask("extract", {
        fn: () => "raw",
        // @ts-expect-error - unsupported trigger rule
        triggerRule: "all_done_soon",
    });

const createUnregisteredTask = () =>
    // @ts-expect-error - DAGTask is type-only; only DAG mints handles
    new DAGTask(createDAG("etl"), createTask("extract", { fn: () => "raw" }));

const connectRaw = (task: DAGTask, other: DAGTask): void => {
    // @ts-expect-error - raw edge insertion is not public
    task.connectTo(other);
};

describe("public task types", () => {
    it("exports every task factory", () => {
        const definitions = [
            createTask("regular", { fn: () => 0 }),
            sensor("sensor", { predicate: () => true }),
            delay("delay", { durationMs: 0 }),
            branch("branch", { choose: () => "left" }),
            shortCircuit("gate", { condition: () => true }),
            trigger("trigger", { dagId: "child" }),
        ];

        expect(definitions.map(({ kind }) => kind)).toStrictEqual([
            TASK_KIND_ENUM.Task,
            TASK_KIND_ENUM.Sensor,
            TASK_KIND_ENUM.Delay,
            TASK_KIND_ENUM.Branch,
            TASK_KIND_ENUM.ShortCircuit,
            TASK_KIND_ENUM.Trigger,
        ]);
    });

    it("exposes every task kind through the enum", () => {
        expect(TASK_KIND_ENUM).toStrictEqual({
            Task: "task",
            Sensor: "sensor",
            Delay: "delay",
            Branch: "branch",
            ShortCircuit: "short_circuit",
            Trigger: "trigger",
        });
    });

    it("exports DAGTask as a type without raw mutation", () => {
        expect(createUnregisteredTask).toBeTypeOf("function");
        expect(connectRaw).toBeTypeOf("function");
    });

    it("preserves task definition literals and function types", () => {
        const definition = createTask("double", {
            fn: (ctx) => ctx.id.length * 2,
            description: "Double the id length",
            config: { timeout_ms: 500 },
            triggerRule: TRIGGER_RULE_ENUM.OneFailed,
        });

        expectTypeOf(definition).toEqualTypeOf<
            TaskParamOutput<"double", (ctx: TaskContext<"double">) => number>
        >();
        expectTypeOf(definition.id).toEqualTypeOf<"double">();
        expectTypeOf(definition.fn).toEqualTypeOf<
            (ctx: TaskContext<"double">) => number
        >();
        expectTypeOf(definition.triggerRule).toEqualTypeOf<TriggerRule>();
        expectTypeOf(definition.description).toEqualTypeOf<
            string | undefined
        >();
        expectTypeOf(definition.config).toEqualTypeOf<TaskConfig | undefined>();
        expectTypeOf(definition).toExtend<TaskLike>();
        expectTypeOf([definition]).toExtend<TaskOrTasks>();
    });

    it("keeps inputs optional and rejects unknown trigger rules", () => {
        const input: TaskParamInput<(ctx: TaskContext<"extract">) => string> = {
            fn: (ctx) => ctx.id,
        };

        expectTypeOf(input.description).toEqualTypeOf<string | undefined>();
        expectTypeOf(input.config).toEqualTypeOf<TaskConfig | undefined>();
        expectTypeOf(input.triggerRule).toEqualTypeOf<
            TriggerRule | undefined
        >();

        expectTypeOf(createInvalidTriggerRule).toBeFunction();
    });

    it("exposes every trigger rule through the enum", () => {
        expect(TRIGGER_RULE_ENUM).toStrictEqual({
            AllSuccess: "all_success",
            AllDone: "all_done",
            OneSuccess: "one_success",
            OneFailed: "one_failed",
            NoneFailed: "none_failed",
            NoneFailedMinOneSuccess: "none_failed_min_one_success",
            AllSkipped: "all_skipped",
        });
        expectTypeOf(TRIGGER_RULE_ENUM.AllDone).toEqualTypeOf<"all_done">();

        const rules: readonly TriggerRule[] = Object.values(TRIGGER_RULE_ENUM);
        const rule: TriggerRule = TRIGGER_RULE_ENUM.NoneFailedMinOneSuccess;

        expect(rules).toHaveLength(7);
        expect(rule).toBe("none_failed_min_one_success");
    });

    it("types timeout config alongside arbitrary keys", () => {
        const config: TaskConfig = { timeout_ms: 5000, retries: 3 };

        expectTypeOf(config.timeout_ms).toEqualTypeOf<number | undefined>();
        expectTypeOf(config.retries).toEqualTypeOf<unknown>();
    });

    it("types JSON snapshots with trigger rules", () => {
        const definition = createTask("report", {
            fn: () => "done",
            triggerRule: TRIGGER_RULE_ENUM.AllDone,
        });

        const dag = createDAG("etl").parse`${definition}`;
        const json = dag.toJSON();
        const [taskJson] = json.tasks;

        expectTypeOf(json).toEqualTypeOf<DAGJson>();
        expectTypeOf(json.dagId).toEqualTypeOf<string>();
        expectTypeOf(taskJson).toEqualTypeOf<TaskJson>();
        expectTypeOf(dag.getTask("report")?.toJSON()).toEqualTypeOf<
            TaskJson | undefined
        >();
        expectTypeOf(taskJson.triggerRule).toEqualTypeOf<TriggerRule>();
        expectTypeOf(taskJson.upstream).toEqualTypeOf<readonly string[]>();
        expect(taskJson.triggerRule).toBe(TRIGGER_RULE_ENUM.AllDone);
    });

    it("types DAG query results", () => {
        const dag = createDAG("etl");

        expectTypeOf(dag.dagId).toEqualTypeOf<"etl">();
        expectTypeOf(dag.tasks).toEqualTypeOf<ReadonlyMap<string, DAGTask>>();
        expectTypeOf(dag.topologicalSort()).toEqualTypeOf<DAGTask[]>();
    });

    it("creates the same DAG instance through createDAG", () => {
        const dag = createDAG("etl");

        expect(dag).toBeInstanceOf(DAG);
        expectTypeOf(dag).toEqualTypeOf<DAG<"etl">>();
        expectTypeOf(dag.dagId).toEqualTypeOf<"etl">();
        expectTypeOf(dag.getTask("extract")).toEqualTypeOf<
            DAGTask<"extract"> | undefined
        >();
        expect(dag.dagId).toBe("etl");
    });

    it("types DAG metadata", () => {
        const metadata: DAGMetadata = { description: "Nightly ETL" };
        const dag = createDAG("etl", metadata);

        expectTypeOf(dag.metadata).toEqualTypeOf<DAGMetadata>();
        expectTypeOf(dag.toJSON().description).toEqualTypeOf<
            string | undefined
        >();
        expect(dag.metadata).toStrictEqual(metadata);
    });

    it("reports an invalid DAG id through validate", () => {
        expect(createDAG("").validate()).toStrictEqual([
            {
                code: DAG_VIOLATION_ENUM.InvalidDagId,
                message: "DAG id cannot be empty",
                subjects: [""],
            },
        ]);
    });

    it("accepts context callbacks on definitions and handles", () => {
        expectTypeOf<() => string>().toExtend<TaskFn>();
        expectTypeOf<(ctx: TaskContext) => string>().toExtend<TaskFn>();
        expectTypeOf<
            (ctx: TaskContext<"extract">) => Promise<number>
        >().toExtend<TaskFn<"extract">>();
        expectTypeOf<TaskContext<"extract">>().toEqualTypeOf<{
            readonly id: "extract";
            readonly payload: undefined;
        }>();

        const dag = createDAG("etl")
            .parse`${createTask("extract", { fn: async () => "raw" })}`;

        const handle = dag.getTask("extract");

        expectTypeOf(handle).toEqualTypeOf<DAGTask<"extract"> | undefined>();

        if (handle !== undefined) {
            expectTypeOf(handle).toExtend<TaskLike>();
            expectTypeOf(handle.triggerRule).toEqualTypeOf<TriggerRule>();
            expectTypeOf(handle.upstream).toEqualTypeOf<ReadonlySet<DAGTask>>();
        }
    });
});
