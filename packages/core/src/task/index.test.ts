import type { StandardSchemaV1 } from "@standard-schema/spec";
import * as v from "valibot";
import { describe, expect, expectTypeOf, it } from "vitest";

import { createDAG } from "../dag/dag";
import {
    branch,
    delay,
    sensor,
    shortCircuit,
    task,
    TASK_KIND_ENUM,
    trigger,
} from "./index";
import type {
    AnyTaskDefinition,
    CreateTask,
    DelayTaskDefinition,
    SensorTaskDefinition,
    ShortCircuitTaskDefinition,
    TaskContext,
    TaskFn,
    TaskKind,
    TaskProducedOf,
    TriggerTaskDefinition,
} from "./index";
import { TRIGGER_RULE_ENUM } from "./trigger-rule";

const regular = task("regular", { fn: () => 0 });

const warehouseInput = v.object({
    warehouseId: v.string(),
    rows: v.number(),
});

const warehouseOutput = v.object({
    warehouseId: v.string(),
    rows: v.number(),
});

const chooseUS = () => "us" as const;

const boundTarget = (value: string) => value;

const makeCapturedTask = (value: string) =>
    task("work", {
        fn: () => value,
    });

// Callback identity is reference-based, so duplicate definitions must share it.
const readyPredicate = () => true;

const kindDefinitions = () => [
    task("extract", { fn: () => 0 }),
    sensor("ready", { predicate: readyPredicate }),
    delay("wait", { durationMs: 1 }),
    branch("route", { choose: () => "left" }),
    shortCircuit("gate", { condition: () => true }),
    trigger("start", { dagId: "child" }),
];

describe("task barrel values", () => {
    it("exports every factory as a function", () => {
        expectTypeOf(branch).toBeFunction();
        expectTypeOf(delay).toBeFunction();
        expectTypeOf(sensor).toBeFunction();
        expectTypeOf(shortCircuit).toBeFunction();
        expectTypeOf(task).toBeFunction();
        expectTypeOf(trigger).toBeFunction();
    });

    it("exports the task kind enum unchanged", () => {
        expect(TASK_KIND_ENUM).toStrictEqual({
            Task: "task",
            Sensor: "sensor",
            Delay: "delay",
            Branch: "branch",
            ShortCircuit: "short_circuit",
            Trigger: "trigger",
        });
    });

    it("builds a definition through each factory", () => {
        const definitions = [
            regular,
            sensor("senser", { predicate: () => true }),
            delay("delayed", { durationMs: 0 }),
            branch("branched", {
                branches: ["left", "right"],
                choose: () => "left",
            }),
            shortCircuit("gated", { condition: () => true }),
            trigger("started", { dagId: "child" }),
        ];

        expect(definitions.map(({ kind }) => kind)).toStrictEqual([
            TASK_KIND_ENUM.Task,
            TASK_KIND_ENUM.Sensor,
            TASK_KIND_ENUM.Delay,
            TASK_KIND_ENUM.Branch,
            TASK_KIND_ENUM.ShortCircuit,
            TASK_KIND_ENUM.Trigger,
        ]);
        expect(regular.id).toBe("regular");
    });
});

describe("task barrel types", () => {
    it("re-exports TaskKind covering the enum values", () => {
        expectTypeOf<TaskKind>().toEqualTypeOf<
            "task" | "sensor" | "delay" | "branch" | "short_circuit" | "trigger"
        >();
    });

    it("re-exports TaskFn and TaskContext", () => {
        expectTypeOf<() => string>().toExtend<TaskFn>();
        expectTypeOf<TaskContext>().toExtend<{
            id: string;
            payload: undefined;
        }>();
    });

    it("re-exports AnyTaskDefinition", () => {
        expectTypeOf(regular).toExtend<AnyTaskDefinition>();
        expectTypeOf<AnyTaskDefinition["kind"]>().toEqualTypeOf<TaskKind>();
    });

    it("re-exports CreateTask", () => {
        expectTypeOf(task).toEqualTypeOf<CreateTask>();
    });

    it("re-exports DelayTaskDefinition and TriggerTaskDefinition", () => {
        const delayed = delay("delayed", { durationMs: 0 });
        const started = trigger("started", { dagId: "child" });

        expectTypeOf(delayed).toExtend<DelayTaskDefinition>();
        expectTypeOf(started).toExtend<TriggerTaskDefinition>();
        expect(delayed.kind).toBe(TASK_KIND_ENUM.Delay);
        expect(started.kind).toBe(TASK_KIND_ENUM.Trigger);
    });
});

describe("shared metadata", () => {
    it("omits absent optional metadata keys from every kind", () => {
        for (const definition of kindDefinitions()) {
            expect(Object.hasOwn(definition, "description")).toBeFalsy();
            expect(Object.hasOwn(definition, "config")).toBeFalsy();
            expect(definition.triggerRule).toBe(TRIGGER_RULE_ENUM.AllSuccess);
        }
    });

    it("keeps metadata absent rather than undefined in JSON", () => {
        const dag = createDAG("kinds").parse`${kindDefinitions()}`;

        for (const taskJson of dag.toJSON().tasks) {
            expect(Object.hasOwn(taskJson, "description")).toBeFalsy();
            expect(Object.hasOwn(taskJson, "config")).toBeFalsy();
        }
    });

    // Metadata is not behavior, so changing it reuses the registered task.
    it("ignores metadata differences when matching a registered task", () => {
        const definitions = kindDefinitions();
        const dag = createDAG("kinds").parse`${definitions}`;

        for (const definition of definitions) {
            expect(
                () =>
                    dag.parse`${{
                        ...definition,
                        description: "extra",
                        config: { retries: 1 },
                        triggerRule: TRIGGER_RULE_ENUM.OneFailed,
                    }}`
            ).not.toThrow();
        }

        expect(
            dag.parse`${sensor("ready", {
                predicate: readyPredicate,
                description: "changed",
                triggerRule: TRIGGER_RULE_ENUM.AllDone,
            })}`
        ).toBe(dag);
        expect(dag.tasks.size).toBe(6);
        expect(dag.getTask("ready")?.description).toBeUndefined();
        expect(dag.getTask("ready")?.triggerRule).toBe(
            TRIGGER_RULE_ENUM.AllSuccess
        );
    });

    // `toJSON()` copies config by reference; only stringification can fail.
    it("defers non-serializable config failures to JSON.stringify", () => {
        const cyclic = {
            retries: 1,
            get self() {
                return cyclic;
            },
        };

        const dag = createDAG("kinds")
            .parse`${task("extract", { fn: () => 0, config: cyclic })}`;

        expect(() => dag.toJSON()).not.toThrow();
        expect(() => JSON.stringify(dag)).toThrow(TypeError);

        const bigint = createDAG("kinds")
            .parse`${task("extract", { fn: () => 0, config: { retries: 1n } })}`;

        expect(() => bigint.toJSON()).not.toThrow();
        expect(() => JSON.stringify(bigint)).toThrow(TypeError);
    });
});

describe("branch identity", () => {
    it("rejects a different branches set under the same id", () => {
        const wide = branch("route", {
            branches: ["us", "eu"],
            choose: () => "us",
        });

        // Same id, different behavior: registration must reject it rather
        // than silently keeping the first definition.
        const dag = createDAG("branches").parse`${wide}`;

        const conflicting = branch("route", {
            branches: ["us", "eu", "apac"],
            choose: () => "us",
        });

        expect(
            () =>
                // @ts-expect-error - same id, different declared branches
                dag.parse`${conflicting}`
        ).toThrow('Task "route" already exists in DAG "branches"');
    });

    it("rejects a reordered branches set as an id collision", () => {
        const base = createDAG("reorder").parse`${branch("route", {
            branches: ["us", "eu"],
            choose: () => "us",
        })}`;

        const reordered = branch("route", {
            branches: ["eu", "us"],
            choose: () => "us",
        });

        expect(
            () =>
                // @ts-expect-error - reordered branches are different behavior
                base.parse`${reordered}`
        ).toThrow('Task "route" already exists in DAG "reorder"');
    });

    it("reuses an identical branches set and chooser", () => {
        const dag = createDAG("branches").parse`${branch("route", {
            branches: ["us", "eu"],
            choose: chooseUS,
        })}`.parse`${branch("route", {
            branches: ["us", "eu"],
            choose: chooseUS,
        })}`;

        expect(dag.tasks.size).toBe(1);
    });
});

describe("schemas and task identity", () => {
    it("does not let schemas change the serialized snapshot", () => {
        const withoutSchema = createDAG("snapshot")
            .parse`${task("sync", { fn: () => "ok" })}`;

        const withSchema = createDAG("snapshot").parse`${task("sync", {
            fn: () => "ok",
            input: warehouseInput,
            output: v.string(),
        })}`;

        expect(withSchema.toJSON()).toStrictEqual(withoutSchema.toJSON());
    });

    it("leaves the task ID unchanged when a schema is declared", () => {
        const plain = createDAG("ids")
            .parse`${task("sync", { fn: () => "ok" })}`;

        const withSchema = createDAG("ids")
            .parse`${task("sync", { fn: () => "ok", input: warehouseInput })}`;

        const plainId = plain.getTask("sync")?.id;
        const schemaId = withSchema.getTask("sync")?.id;

        // Schemas are metadata: they do not change the declared task id.
        expect(plainId).toBe(schemaId);
    });
});

describe("task id conflicts", () => {
    const callableCases: readonly (readonly [
        string,
        (value: string) => AnyTaskDefinition,
    ])[] = [
        ["task", makeCapturedTask],
        [
            "sensor",
            (value) =>
                sensor("work", {
                    predicate: () => value === "first",
                }),
        ],
        [
            "branch",
            (value) =>
                branch("work", {
                    choose: () => value,
                }),
        ],
        [
            "short-circuit",
            (value) =>
                shortCircuit("work", {
                    condition: () => value === "first",
                }),
        ],
    ];

    it.each(callableCases)(
        "rejects capture-only differences in a %s callback",
        (_kind, build) => {
            const dag = createDAG("capture").parse`${build("first")}`;

            expect(() => dag.parse`${build("second")}`).toThrow(
                /different behavior/u
            );
            expect(dag.tasks.size).toBe(1);
        }
    );

    it("rejects capture-only differences within one batch", () => {
        const dag = createDAG("batch");

        expect(
            () =>
                dag.parse`${[makeCapturedTask("first"), makeCapturedTask("second")]}`
        ).toThrow(/different behavior/u);
        expect(dag.tasks.size).toBe(0);
    });

    it("rejects bound callbacks that share native source", () => {
        const dag = createDAG("bound").parse`${task("sync", {
            fn: boundTarget.bind(null, "customers"),
        })}`;

        expect(
            () =>
                dag.parse`${task("sync", { fn: boundTarget.bind(null, "orders") })}`
        ).toThrow(/different behavior/u);
        expect(dag.tasks.size).toBe(1);
    });

    it("rejects separate bound callbacks with the same pre-bound value", () => {
        const dag = createDAG("bound-same").parse`${task("sync", {
            fn: boundTarget.bind(null, "customers"),
        })}`;

        expect(
            () =>
                dag.parse`${task("sync", {
                    fn: boundTarget.bind(null, "customers"),
                })}`
        ).toThrow(/different behavior/u);
        expect(dag.tasks.size).toBe(1);
    });

    it("reuses declarative kinds with equal behavior", () => {
        const dag = createDAG("declarative")
            .parse`${delay("wait", { durationMs: 10, description: "first" })}`
            .parse`${delay("wait", { durationMs: 10, description: "second" })}`
            .parse`${trigger("start", { dagId: "child", description: "first" })}`
            .parse`${trigger("start", {
            dagId: "child",
            description: "second",
        })}`;

        expect(dag.tasks.size).toBe(2);
        expect(dag.getTask("wait")?.description).toBe("first");
        expect(dag.getTask("start")?.description).toBe("first");
    });
});

describe("kind-specific produced values", () => {
    it("infers branch names from the branches tuple", () => {
        const definition = branch("route", {
            branches: ["left", "right"],
            choose: () => "left",
        });

        expectTypeOf(definition.branches).toEqualTypeOf<
            readonly ["left", "right"] | undefined
        >();
        expect(definition.branches).toStrictEqual(["left", "right"]);
    });

    it("rejects a chosen branch outside the branches tuple", () => {
        expect(() =>
            branch("route", {
                branches: ["left", "right"],
                // @ts-expect-error - "middle" is not a declared branch
                choose: () => "middle",
            })
        ).not.toThrow();
    });

    it("defaults a branch output to its chosen names", () => {
        const definition = branch("route", {
            branches: ["left", "right"],
            choose: () => "left",
        });

        expectTypeOf(definition.output).toEqualTypeOf<
            | StandardSchemaV1<
                  "left" | "right" | readonly ("left" | "right")[],
                  "left" | "right" | readonly ("left" | "right")[]
              >
            | undefined
        >();
    });

    it("defaults a sensor output to boolean", () => {
        const definition = sensor("ready", { predicate: () => true });

        expectTypeOf(definition).toEqualTypeOf<
            SensorTaskDefinition<"ready", undefined, StandardSchemaV1<boolean>>
        >();
    });

    it("defaults a short-circuit output to boolean", () => {
        const definition = shortCircuit("gate", { condition: () => true });

        expectTypeOf(definition).toEqualTypeOf<
            ShortCircuitTaskDefinition<
                "gate",
                undefined,
                StandardSchemaV1<boolean>
            >
        >();
    });

    it("reads the produced value back from a declared output schema", () => {
        const definition = task("sync", {
            fn: () => ({ warehouseId: "w1", rows: 1 }),
            output: warehouseOutput,
        });

        // `output` is an optional property, so its type is
        // `Schema | undefined`. Reading it back must not collapse to
        // `unknown` through the absent-schema branch.
        expectTypeOf<TaskProducedOf<typeof definition.output>>().toEqualTypeOf<{
            warehouseId: string;
            rows: number;
        }>();
    });

    it("reads the produced value back from a kind default", () => {
        const ready = sensor("ready", { predicate: () => true });
        const gate = shortCircuit("gate", { condition: () => true });

        expectTypeOf<
            TaskProducedOf<typeof ready.output>
        >().toEqualTypeOf<boolean>();
        expectTypeOf<
            TaskProducedOf<typeof gate.output>
        >().toEqualTypeOf<boolean>();
    });

    it("keeps the produced value unknown without an output schema", () => {
        const definition = task("sync", { fn: () => "ok" });

        expectTypeOf<
            TaskProducedOf<typeof definition.output>
        >().toEqualTypeOf<unknown>();
    });

    it("keeps declarative kinds schema-free by default", () => {
        expectTypeOf(delay("wait", { durationMs: 1 })).toEqualTypeOf<
            DelayTaskDefinition<"wait">
        >();
        expectTypeOf(trigger("start", { dagId: "x" })).toEqualTypeOf<
            TriggerTaskDefinition<"start">
        >();
    });
});

describe("input and output schemas", () => {
    it("types payloads on every callback kind", () => {
        const sensorDefinition = sensor("ready", {
            predicate: (ctx) => ctx.payload.rows > 0,
            input: warehouseInput,
        });

        const branchDefinition = branch("route", {
            choose: (ctx) => (ctx.payload.rows > 0 ? "big" : "small"),
            input: warehouseInput,
        });

        const gateDefinition = shortCircuit("gate", {
            condition: (ctx) => ctx.payload.rows > 0,
            input: warehouseInput,
        });

        expect(
            sensorDefinition.predicate({
                id: "ready",
                payload: { warehouseId: "w1", rows: 3 },
            })
        ).toBeTruthy();
        expect(
            branchDefinition.choose({
                id: "route",
                payload: { warehouseId: "w1", rows: 0 },
            })
        ).toBe("small");
        expect(
            gateDefinition.condition({
                id: "gate",
                payload: { warehouseId: "w1", rows: 1 },
            })
        ).toBeTruthy();
    });
});
