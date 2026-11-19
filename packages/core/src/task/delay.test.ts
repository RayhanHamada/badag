import type { StandardSchemaV1 } from "@standard-schema/spec";
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { createDAG } from "../dag/dag";
import type { AnySchema } from "./base";
import { delay } from "./delay";
import type { DelayTaskDefinition } from "./delay";
import { TASK_KIND_ENUM } from "./kind";
import { TRIGGER_RULE_ENUM } from "./trigger-rule";

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

describe("schemas on every task kind", () => {
    it("validates a delay output schema", async () => {
        const definition = delay("wait", { durationMs: 5, output: z.string() });

        expect(valueOf(await validate(definition.output, "done"))).toBe("done");
        expect(
            issuesOf(await validate(definition.output, 1)).length
        ).toBeGreaterThan(0);
    });
});
