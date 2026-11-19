import { describe, expect, expectTypeOf, it } from "vitest";

import { createDAG } from "../dag/dag";
import type { SchemaOf } from "./base";
import { branch } from "./branch";
import type { BranchChoice } from "./branch";
import type { AnyTaskDefinition } from "./definitions";
import { delay } from "./delay";
import type { DelayTaskDefinition } from "./delay";
import { TASK_KIND_ENUM } from "./kind";
import { sensor } from "./sensor";
import type { SensorTaskDefinition } from "./sensor";
import { shortCircuit } from "./short-circuit";
import type { ShortCircuitTaskDefinition } from "./short-circuit";
import { task } from "./task";
import { trigger } from "./trigger";
import type { TriggerTaskDefinition } from "./trigger";
import { TRIGGER_RULE_ENUM } from "./trigger-rule";

const context = <Id extends string, Payload = undefined>(
    id: Id,
    payload?: Payload
) => ({
    id,
    // SAFETY: callers pass the payload their definition's schema produced;
    // the helper only threads it through unchanged.
    payload: payload as Payload,
});

// Callback identity is reference-based, so duplicate definitions must share it.
const readyPredicate = () => true;

const boundTarget = (value: string) => value;

const makeCapturedTask = (value: string) =>
    task("work", {
        fn: () => value,
    });

describe("sensor tasks", () => {
    it("evaluates the predicate with a task context", async () => {
        let calls = 0;

        const definition = sensor("ready", {
            predicate: async () => {
                calls += 1;

                return true;
            },
            pokeIntervalMs: 10,
        });

        expectTypeOf(definition).toEqualTypeOf<SensorTaskDefinition<"ready">>();
        expect(definition.kind).toBe(TASK_KIND_ENUM.Sensor);
        expect(definition.pokeIntervalMs).toBe(10);
        await expect(
            definition.predicate(context("ready"))
        ).resolves.toBeTruthy();
        expect(calls).toBe(1);
    });

    it("keeps the optional poke interval and metadata", () => {
        const definition = sensor("  ready  ", {
            predicate: () => true,
            description: "Wait for readiness",
            config: { timeout_ms: 500 },
            triggerRule: TRIGGER_RULE_ENUM.AllDone,
        });

        expectTypeOf(definition).toEqualTypeOf<SensorTaskDefinition<"ready">>();
        expect(definition).toMatchObject({
            id: "ready",
            kind: TASK_KIND_ENUM.Sensor,
            description: "Wait for readiness",
            config: { timeout_ms: 500 },
            triggerRule: TRIGGER_RULE_ENUM.AllDone,
        });
        expect(definition.pokeIntervalMs).toBeUndefined();
    });

    it("rejects non-positive poke intervals", () => {
        expect(() =>
            sensor("ready", { predicate: () => true, pokeIntervalMs: 0 })
        ).toThrow("pokeIntervalMs must be greater than 0");
        expect(() =>
            sensor("ready", { predicate: () => true, pokeIntervalMs: -1 })
        ).toThrow("pokeIntervalMs must be greater than 0");
    });

    it("passes the literal task id to the predicate", () => {
        const definition = sensor("  ready  ", {
            predicate: (ctx) => ctx.id === "ready",
        });

        expectTypeOf(definition).toEqualTypeOf<SensorTaskDefinition<"ready">>();
        expect(definition.predicate(context("ready"))).toBeTruthy();
    });

    it("returns false while the predicate is unsatisfied", () => {
        const definition = sensor("ready", { predicate: () => false });

        expect(definition.predicate(context("ready"))).toBeFalsy();
    });

    it("omits the poke interval key when the input omits it", () => {
        const omitted = sensor("ready", { predicate: () => true });

        const explicitUndefined = sensor("ready", {
            predicate: () => true,
            pokeIntervalMs: undefined,
        });

        expect(Object.hasOwn(omitted, "pokeIntervalMs")).toBeFalsy();
        expect(Object.hasOwn(explicitUndefined, "pokeIntervalMs")).toBeFalsy();
    });

    it("accepts a fractional poke interval", () => {
        const definition = sensor("ready", {
            predicate: () => true,
            pokeIntervalMs: 0.5,
        });

        expect(definition.pokeIntervalMs).toBe(0.5);
    });

    it("rejects non-finite poke intervals", () => {
        for (const pokeIntervalMs of [
            Number.NaN,
            Number.POSITIVE_INFINITY,
            Number.NEGATIVE_INFINITY,
        ]) {
            expect(() =>
                sensor("ready", { predicate: () => true, pokeIntervalMs })
            ).toThrow(TypeError);
        }
    });

    // The polling interval is metadata, so it does not affect the task ID.
    it("reuses a same-id sensor whose interval differs, keeping the first", () => {
        const first = sensor("ready", {
            predicate: readyPredicate,
            pokeIntervalMs: 10,
        });

        const second = sensor("ready", {
            predicate: readyPredicate,
            pokeIntervalMs: 20,
        });

        const dag = createDAG("kinds").parse`${first}`.parse`${second}`;

        const registered = dag.getTask("ready");

        expect(dag.tasks.size).toBe(1);

        if (registered?.definition.kind !== TASK_KIND_ENUM.Sensor) {
            throw new Error("Expected a sensor definition");
        }

        expect(registered.definition.pokeIntervalMs).toBe(10);
    });
});

describe("delay tasks", () => {
    it("stores the duration", () => {
        const definition = delay("wait", { durationMs: 25 });

        expectTypeOf(definition).toEqualTypeOf<DelayTaskDefinition<"wait">>();
        expect(definition.kind).toBe(TASK_KIND_ENUM.Delay);
        expect(definition.durationMs).toBe(25);
    });

    it("rejects negative or non-finite durations", () => {
        expect(() => delay("wait", { durationMs: -1 })).toThrow(
            "durationMs must be greater than or equal to 0"
        );
        expect(() => delay("wait", { durationMs: Number.NaN })).toThrow(
            "durationMs must be a finite number"
        );
    });

    it("trims the id", () => {
        const definition = delay("  wait  ", { durationMs: 0 });

        expectTypeOf(definition).toEqualTypeOf<DelayTaskDefinition<"wait">>();
        expect(definition.id).toBe("wait");
    });

    it("accepts a zero duration", () => {
        const definition = delay("wait", { durationMs: 0 });

        expect(definition.durationMs).toBe(0);
        expect(Object.is(definition.durationMs, -0)).toBeFalsy();
    });

    it("preserves a negative zero duration", () => {
        const definition = delay("wait", { durationMs: -0 });

        expect(Object.is(definition.durationMs, -0)).toBeTruthy();
        expect(definition.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("keeps a fractional duration", () => {
        expect(delay("wait", { durationMs: 12.5 }).durationMs).toBe(12.5);
    });

    it("accepts the largest safe integer duration", () => {
        expect(
            delay("wait", { durationMs: Number.MAX_SAFE_INTEGER }).durationMs
        ).toBe(Number.MAX_SAFE_INTEGER);
    });

    it("rejects an infinite duration", () => {
        for (const durationMs of [
            Number.POSITIVE_INFINITY,
            Number.NEGATIVE_INFINITY,
        ]) {
            expect(() => delay("wait", { durationMs })).toThrow(
                "durationMs must be a finite number"
            );
        }
    });

    it("keeps the task's own metadata", () => {
        const definition = delay("wait", {
            durationMs: 100,
            description: "Pause before publishing",
            config: { timeout_ms: 250 },
            triggerRule: TRIGGER_RULE_ENUM.AllDone,
        });

        expect(definition).toMatchObject({
            kind: TASK_KIND_ENUM.Delay,
            id: "wait",
            durationMs: 100,
            description: "Pause before publishing",
            config: { timeout_ms: 250 },
            triggerRule: TRIGGER_RULE_ENUM.AllDone,
        });
    });

    // The duration is behavior, so a differing value conflicts with the id.
    it("rejects a same-id delay with a different duration", () => {
        const dag = createDAG("kinds")
            .parse`${delay("wait", { durationMs: 10 })}`;

        expect(() => dag.parse`${delay("wait", { durationMs: 20 })}`).toThrow(
            'Task "wait" already exists in DAG "kinds"'
        );
        expect(dag.tasks.size).toBe(1);
    });

    it("accepts a same-id delay with an identical duration", () => {
        const dag = createDAG("kinds")
            .parse`${delay("wait", { durationMs: 10 })}`
            .parse`${delay("wait", { durationMs: 10 })}`;

        expect(dag.tasks.size).toBe(1);
    });
});

describe("branch tasks", () => {
    it("returns the chosen branch or branches", async () => {
        const definition = branch("route", {
            choose: async (ctx) =>
                ctx.id === "route" ? (["left", "right"] as const) : "left",
        });

        expectTypeOf(definition.id).toEqualTypeOf<"route">();
        expectTypeOf(definition.branches).toEqualTypeOf<
            readonly string[] | undefined
        >();
        expectTypeOf(definition.output).toEqualTypeOf<
            SchemaOf<BranchChoice<string>> | undefined
        >();
        expect(definition.kind).toBe(TASK_KIND_ENUM.Branch);
        await expect(
            definition.choose(context("route"))
        ).resolves.toStrictEqual(["left", "right"]);
    });

    it("returns a single branch name without wrapping it", () => {
        const definition = branch("route", { choose: () => "left" });

        expect(definition.choose(context("route"))).toBe("left");
    });

    it("passes the literal task id to the chooser", () => {
        const definition = branch("  route  ", {
            choose: (ctx) => (ctx.id === "route" ? "left" : "right"),
        });

        expectTypeOf(definition.id).toEqualTypeOf<"route">();
        expect(definition.id).toBe("route");
        expect(definition.choose(context("route"))).toBe("left");
    });

    it("passes the chosen set through unchanged, including an empty set", () => {
        const definition = branch("route", { choose: () => [] as const });

        expect(definition.choose(context("route"))).toStrictEqual([]);
    });

    it("propagates a rejection from an async chooser", async () => {
        const failure = new Error("chooser failed");

        const definition = branch("route", {
            choose: async () => {
                throw failure;
            },
        });

        await expect(definition.choose(context("route"))).rejects.toBe(failure);
    });

    it("keeps metadata and trims the id", () => {
        const definition = branch("  route  ", {
            choose: () => "left",
            description: "Pick a path",
            config: { strategy: "weighted" },
            triggerRule: TRIGGER_RULE_ENUM.OneSuccess,
        });

        expect(definition).toMatchObject({
            kind: TASK_KIND_ENUM.Branch,
            id: "route",
            description: "Pick a path",
            config: { strategy: "weighted" },
            triggerRule: TRIGGER_RULE_ENUM.OneSuccess,
        });
    });

    it("rejects a same-id branch whose chooser differs", () => {
        const dag = createDAG("kinds")
            .parse`${branch("route", { choose: () => "left" })}`;

        expect(
            () => dag.parse`${branch("route", { choose: () => "right" })}`
        ).toThrow('Task "route" already exists in DAG "kinds"');
        expect(dag.tasks.size).toBe(1);
    });

    it("rejects a same-id task of a different kind", () => {
        const dag = createDAG("kinds")
            .parse`${task("route", { fn: () => "raw" })}`;

        expect(
            () => dag.parse`${branch("route", { choose: () => "left" })}`
        ).toThrow('Task "route" already exists in DAG "kinds"');
        expect(dag.tasks.size).toBe(1);
    });
});

describe("short-circuit tasks", () => {
    it("returns the condition result", async () => {
        const definition = shortCircuit("gate", {
            condition: async (ctx) => ctx.id === "gate",
        });

        expectTypeOf(definition).toEqualTypeOf<
            ShortCircuitTaskDefinition<"gate", undefined, SchemaOf<boolean>>
        >();
        expect(definition.kind).toBe(TASK_KIND_ENUM.ShortCircuit);
        await expect(
            definition.condition(context("gate"))
        ).resolves.toBeTruthy();
    });

    it("returns false when the condition is unsatisfied", () => {
        const definition = shortCircuit("gate", { condition: () => false });

        expect(definition.condition(context("gate"))).toBeFalsy();
    });

    it("passes the literal task id to the condition", () => {
        const definition = shortCircuit("  gate  ", {
            condition: (ctx) => ctx.id === "gate",
        });

        expectTypeOf(definition).toEqualTypeOf<
            ShortCircuitTaskDefinition<"gate", undefined, SchemaOf<boolean>>
        >();
        expect(definition.id).toBe("gate");
    });

    it("propagates a rejection from an async condition", async () => {
        const failure = new Error("condition failed");

        const definition = shortCircuit("gate", {
            condition: async () => {
                throw failure;
            },
        });

        await expect(definition.condition(context("gate"))).rejects.toBe(
            failure
        );
    });

    it("keeps metadata", () => {
        const definition = shortCircuit("gate", {
            condition: () => true,
            description: "Stop when empty",
            config: { on_skip: "prune" },
            triggerRule: TRIGGER_RULE_ENUM.AllDone,
        });

        expect(definition).toMatchObject({
            kind: TASK_KIND_ENUM.ShortCircuit,
            id: "gate",
            description: "Stop when empty",
            config: { on_skip: "prune" },
            triggerRule: TRIGGER_RULE_ENUM.AllDone,
        });
    });

    it("rejects a same-id gate whose condition differs", () => {
        const dag = createDAG("kinds")
            .parse`${shortCircuit("gate", { condition: () => true })}`;

        expect(
            () => dag.parse`${shortCircuit("gate", { condition: () => false })}`
        ).toThrow('Task "gate" already exists in DAG "kinds"');
        expect(dag.tasks.size).toBe(1);
    });
});

describe("trigger tasks", () => {
    it("defaults waitForCompletion", () => {
        const definition = trigger("start", { dagId: "child" });

        expectTypeOf(definition).toEqualTypeOf<
            TriggerTaskDefinition<"start">
        >();
        expect(definition.kind).toBe(TASK_KIND_ENUM.Trigger);
        expect(definition.dagId).toBe("child");
        expect(definition.waitForCompletion).toBeFalsy();
    });

    it("supports waiting for the target DAG", () => {
        const definition = trigger("start", {
            dagId: "child",
            waitForCompletion: true,
        });

        expect(definition.waitForCompletion).toBeTruthy();
    });

    it("rejects an empty target DAG id", () => {
        expect(() => trigger("start", { dagId: "   " })).toThrow(
            "Trigger DAG id cannot be empty"
        );
    });

    it("rejects an empty target DAG id before validating the task id", () => {
        expect(() => trigger("bad id", { dagId: "" })).toThrow(
            "Trigger DAG id cannot be empty"
        );
    });

    it("keeps the target DAG id verbatim", () => {
        expect(trigger("start", { dagId: "  child  " }).dagId).toBe(
            "  child  "
        );
    });

    it("records an explicit false wait flag", () => {
        const definition = trigger("start", {
            dagId: "child",
            waitForCompletion: false,
        });

        expect(definition.waitForCompletion).toBeFalsy();
    });

    it("keeps metadata and trims the task id", () => {
        const definition = trigger("  start  ", {
            dagId: "child",
            description: "Kick off the child DAG",
            config: { retries: 2 },
            triggerRule: TRIGGER_RULE_ENUM.OneFailed,
        });

        expect(definition).toMatchObject({
            kind: TASK_KIND_ENUM.Trigger,
            id: "start",
            dagId: "child",
            waitForCompletion: false,
            description: "Kick off the child DAG",
            config: { retries: 2 },
            triggerRule: TRIGGER_RULE_ENUM.OneFailed,
        });
    });

    it("rejects a same-id trigger targeting a different DAG", () => {
        const start = trigger("start", { dagId: "a" });
        const other = trigger("start", { dagId: "b" });
        const dag = createDAG("kinds").parse`${start}`;

        expect(() => dag.parse`${other}`).toThrow(
            'Task "start" already exists in DAG "kinds"'
        );
        expect(dag.tasks.size).toBe(1);
    });

    it("rejects a same-id trigger whose wait flag differs", () => {
        const start = trigger("start", { dagId: "a" });

        const waiting = trigger("start", {
            dagId: "a",
            waitForCompletion: true,
        });

        const dag = createDAG("kinds").parse`${start}`;

        expect(() => dag.parse`${waiting}`).toThrow(
            'Task "start" already exists in DAG "kinds"'
        );
        expect(dag.tasks.size).toBe(1);
    });

    it("accepts a same-id trigger with identical target and wait flag", () => {
        const start = trigger("start", { dagId: "a" });
        const same = trigger("start", { dagId: "a", waitForCompletion: false });
        const dag = createDAG("kinds").parse`${start}`.parse`${same}`;

        expect(dag.tasks.size).toBe(1);
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

const kindDefinitions = () => [
    task("extract", { fn: () => 0 }),
    sensor("ready", { predicate: readyPredicate }),
    delay("wait", { durationMs: 1 }),
    branch("route", { choose: () => "left" }),
    shortCircuit("gate", { condition: () => true }),
    trigger("start", { dagId: "child" }),
];

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

describe("DAG integration", () => {
    it("registers every task kind and serializes its metadata", () => {
        const dag = createDAG("kinds")
            .parse`${task("extract", { fn: () => "raw" })} >> ${sensor("ready", { predicate: () => true, pokeIntervalMs: 5000 })} >> ${delay("wait", { durationMs: 25 })} >> ${branch("route", { choose: () => "left" })} >> ${shortCircuit("gate", { condition: () => true })} >> ${trigger("start", { dagId: "child", waitForCompletion: true })}`;

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
            .parse`${task("extract", { fn: () => "raw" })} >> ${sensor("ready", { predicate: () => true, pokeIntervalMs: 5000 })} >> ${delay("wait", { durationMs: 25 })} >> ${branch("route", { choose: () => "left" })} >> ${shortCircuit("gate", { condition: () => true })} >> ${trigger("start", { dagId: "child", waitForCompletion: true })}`;

        const snapshots = dag
            .topologicalSort()
            .map((registered) => registered.toJSON());

        // A handle and its DAG entry are the same snapshot, kind fields included.
        expect(snapshots).toStrictEqual(dag.toJSON().tasks);
    });

    it("rejects reusing one id across kinds", () => {
        const definitions = [
            task("shared", { fn: () => 0 }),
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
            task("extract", { fn: () => 0 }),
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
            .parse`${task("extract", { fn: () => "raw" })} >> ${sensor("ready", { predicate: () => true })} >> ${delay("wait", { durationMs: 25 })} >> ${shortCircuit("gate", { condition: () => true })} >> ${trigger("start", { dagId: "child" })}`;

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
            .parse`${task("extract", { fn: () => 0 })} >> ${[gate, route]} >> ${start}`;

        const extract = dag.getTask("extract");

        const downstream = [...(extract?.downstream ?? [])].map(({ id }) => id);

        expect(downstream).toStrictEqual(["gate", "route"]);
        expect(
            [...(dag.getTask("start")?.upstream ?? [])].map(({ id }) => id)
        ).toStrictEqual(["gate", "route"]);
    });
});
