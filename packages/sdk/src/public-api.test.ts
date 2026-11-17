import type { DAG } from "@badag/core";
import { describe, expect, expectTypeOf, it } from "vitest";

import * as sdk from "./index";
import type {
    AnyTaskDefinition,
    BranchTaskDefinition,
    CreateTask,
    DAGMetadata,
    DelayTaskDefinition,
    TaskContext,
    TaskDefinitionBase,
    TaskFn,
    TaskKind,
    TaskParamInput,
    TaskProducedOf,
    TriggerRule,
} from "./index";

describe("@badag/sdk", () => {
    it("exposes the DAG factory and every task factory", () => {
        expect(Object.keys(sdk).toSorted()).toStrictEqual(
            [
                "TASK_KIND_ENUM",
                "branch",
                "createDAG",
                "delay",
                "sensor",
                "shortCircuit",
                "task",
                "trigger",
            ].toSorted()
        );
    });

    it("returns a core DAG that wiring accepts", () => {
        const metadata: DAGMetadata = { description: "Nightly ETL" };
        const created = sdk.createDAG("etl", metadata);

        const extract = sdk.task("extract", { fn: () => "raw" });
        const settle = sdk.delay("settle", { durationMs: 100 });
        const load = sdk.task("load", { fn: () => "stored" });

        const dag = created.parse`${extract} >> ${settle} >> ${load}`;

        expectTypeOf(created).toEqualTypeOf<DAG<"etl">>();
        expect(created.metadata).toStrictEqual(metadata);
        expect(dag.topologicalSort().map((task) => task.id)).toStrictEqual([
            "extract",
            "settle",
            "load",
        ]);
    });

    it("builds every task kind", () => {
        const regular = sdk.task("extract", { fn: () => "raw" });
        const delayed = sdk.delay("settle", { durationMs: 100 });

        const routed = sdk.branch("route", {
            branches: ["us", "eu"] as const,
            choose: () => "us",
        });

        const polled = sdk.sensor("ready", { predicate: () => true });
        const gated = sdk.shortCircuit("gate", { condition: () => true });
        const triggered = sdk.trigger("fanout", { dagId: "other" });

        expect([
            regular.kind,
            delayed.kind,
            routed.kind,
            polled.kind,
            gated.kind,
            triggered.kind,
        ]).toStrictEqual([
            sdk.TASK_KIND_ENUM.Task,
            sdk.TASK_KIND_ENUM.Delay,
            sdk.TASK_KIND_ENUM.Branch,
            sdk.TASK_KIND_ENUM.Sensor,
            sdk.TASK_KIND_ENUM.ShortCircuit,
            sdk.TASK_KIND_ENUM.Trigger,
        ]);
        expect(delayed.durationMs).toBe(100);
        expect(triggered.dagId).toBe("other");
        expectTypeOf(delayed).toEqualTypeOf<DelayTaskDefinition<"settle">>();
        expectTypeOf(routed).toEqualTypeOf<
            BranchTaskDefinition<"route", readonly ["us", "eu"]>
        >();
    });

    it("re-exports task authoring types", () => {
        const fn = ((ctx: TaskContext<"extract">) =>
            ctx.id.length) satisfies TaskFn<"extract", undefined, number>;

        const create: CreateTask = sdk.task;
        const definition = create("extract", { fn });

        const params = {
            description: "extract rows",
            fn,
            triggerRule: "all_success",
        } satisfies TaskParamInput<typeof fn>;

        const base: TaskDefinitionBase<"extract", TaskKind> = definition;
        const anyDefinition: AnyTaskDefinition = definition;
        const produced: TaskProducedOf<undefined> = undefined;
        const rule: TriggerRule = "all_success";

        expectTypeOf(base.id).toEqualTypeOf<"extract">();
        expectTypeOf(fn).returns.toEqualTypeOf<number>();
        expect(anyDefinition.kind).toBe("task");
        expect(params.description).toBe("extract rows");
        expect(produced).toBeUndefined();
        expect(rule).toBe("all_success");
    });
});
