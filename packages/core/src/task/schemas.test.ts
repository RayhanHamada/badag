import type { StandardSchemaV1 } from "@standard-schema/spec";
import * as v from "valibot";
import { describe, expect, expectTypeOf, it } from "vitest";

import { createDAG } from "../dag/dag";
import { branch } from "./factories/branch";
import { delay } from "./factories/delay";
import { sensor } from "./factories/sensor";
import { shortCircuit } from "./factories/short-circuit";
import { task } from "./factories/task";
import { trigger } from "./factories/trigger";
import type { TaskProducedOf } from "./types/base";
import type { DelayTaskDefinition } from "./types/delay";
import type { SensorTaskDefinition } from "./types/sensor";
import type { ShortCircuitTaskDefinition } from "./types/short-circuit";
import type { TriggerTaskDefinition } from "./types/trigger";

const warehouseInput = v.object({
    warehouseId: v.string(),
    rows: v.number(),
});

const warehouseOutput = v.object({
    warehouseId: v.string(),
    rows: v.number(),
});

const chooseUS = () => "us" as const;

describe("input and output schemas", () => {
    it("types ctx.payload from an input schema", () => {
        const definition = task("sync", {
            fn: (ctx) => ctx.payload.rows * 2,
            input: warehouseInput,
        });

        expectTypeOf(definition.fn).toEqualTypeOf<
            (ctx: {
                readonly id: "sync";
                readonly payload: { warehouseId: string; rows: number };
            }) => number
        >();
        expect(
            definition.fn({
                id: "sync",
                payload: { warehouseId: "w1", rows: 21 },
            })
        ).toBe(42);
    });

    it("defaults the payload to undefined without an input schema", () => {
        const definition = task("plain", { fn: (ctx) => ctx.payload });

        expectTypeOf(definition.fn).toEqualTypeOf<
            (ctx: {
                readonly id: "plain";
                readonly payload: undefined;
            }) => undefined
        >();
        expect(
            definition.fn({ id: "plain", payload: undefined })
        ).toBeUndefined();
    });

    it("constrains the returned value with an output schema", () => {
        const definition = task("count", {
            fn: () => "42",
            output: v.string(),
        });

        expectTypeOf(definition.fn).returns.toEqualTypeOf<string>();
        expect(() =>
            task("bad", {
                // @ts-expect-error - the output schema requires a string
                fn: () => 42,
                output: v.string(),
            })
        ).not.toThrow();
    });

    it("stores the declared schemas on the definition", () => {
        const definition = task("sync", {
            fn: () => "ok",
            input: warehouseInput,
            output: v.string(),
        });

        expect(definition.input).toBe(warehouseInput);
        expect(definition.output).toBeDefined();
        expect(definition.output?.["~standard"].validate("ok")).toStrictEqual({
            value: "ok",
            typed: true,
        });
    });

    it("omits schema properties when none are declared", () => {
        const definition = task("plain", { fn: () => 0 });

        expect("input" in definition).toBeFalsy();
        expect("output" in definition).toBeFalsy();
    });

    it("keeps only the declared schema", () => {
        const onlyInput = task("in-only", {
            fn: () => 0,
            input: warehouseInput,
        });

        const onlyOutput = task("out-only", {
            fn: () => 0,
            output: v.number(),
        });

        expect("input" in onlyInput).toBeTruthy();
        expect("output" in onlyInput).toBeFalsy();
        expect("input" in onlyOutput).toBeFalsy();
        expect("output" in onlyOutput).toBeTruthy();
    });

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

    it("defaults declarative kinds to no schemas", () => {
        const delayed = delay("wait", { durationMs: 5 });
        const started = trigger("start", { dagId: "child" });

        expect("input" in delayed).toBeFalsy();
        expect("output" in delayed).toBeFalsy();
        expect("input" in started).toBeFalsy();
        expect("output" in started).toBeFalsy();
    });

    it("accepts schemas on declarative kinds", () => {
        const delayed = delay("wait", {
            durationMs: 5,
            input: warehouseInput,
            output: v.string(),
        });

        const started = trigger("start", {
            dagId: "child",
            input: warehouseInput,
        });

        expect(delayed.input).toBe(warehouseInput);
        expect(started.input).toBe(warehouseInput);
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
