import type { StandardSchemaV1 } from "@standard-schema/spec";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { createDAG } from "../dag/dag";
import type { AnySchema } from "./base";
import { TASK_KIND_ENUM } from "./kind";
import { sensor } from "./sensor";
import type { SensorTaskDefinition } from "./sensor";
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

/**
 * The value a schema is asked to validate, taken from the Standard Schema
 * protocol itself rather than restated as `unknown`.
 */
type UnvalidatedValue = Parameters<
    StandardSchemaV1["~standard"]["validate"]
>[0];

/**
 * Validate a value through a schema stored on a task definition.
 *
 * A definition's schema is optional, so an absent one is a test bug rather
 * than a validation failure. Awaiting covers both the synchronous and
 * asynchronous results a schema may return.
 */
const validate = async (
    schema: AnySchema,
    value: UnvalidatedValue
): Promise<StandardSchemaV1.Result<unknown>> => {
    if (schema === undefined) {
        throw new Error("expected the definition to declare a schema");
    }

    return await schema["~standard"].validate(value);
};

/**
 * Narrow a passing result to its validated value.
 */
const valueOf = (result: StandardSchemaV1.Result<unknown>): unknown => {
    if (result.issues !== undefined) {
        throw new Error(
            `expected validation to pass, got: ${result.issues[0]?.message}`
        );
    }

    return result.value;
};

/**
 * Narrow a failing result to its issues.
 */
const issuesOf = (
    result: StandardSchemaV1.Result<unknown>
): readonly StandardSchemaV1.Issue[] => {
    if (result.issues === undefined) {
        throw new Error("expected validation to fail");
    }

    return result.issues;
};

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

describe("schemas on every task kind", () => {
    it("validates a sensor input schema", async () => {
        const definition = sensor("ready", {
            input: z.object({ rows: z.number() }),
            predicate: (ctx) => ctx.payload.rows > 0,
        });

        expect(
            valueOf(await validate(definition.input, { rows: 1 }))
        ).toStrictEqual({ rows: 1 });
        expect(
            issuesOf(await validate(definition.input, {})).length
        ).toBeGreaterThan(0);
        expect(
            definition.predicate({
                id: "ready",
                payload: { rows: 1 },
            })
        ).toBeTruthy();
    });
});
