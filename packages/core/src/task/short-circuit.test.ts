import type { StandardSchemaV1 } from "@standard-schema/spec";
import * as v from "valibot";
import { describe, expect, expectTypeOf, it } from "vitest";

import { createDAG } from "../dag/dag";
import type { AnySchema, SchemaOf } from "./base";
import { TASK_KIND_ENUM } from "./kind";
import { shortCircuit } from "./short-circuit";
import type { ShortCircuitTaskDefinition } from "./short-circuit";
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

describe("schemas on every task kind", () => {
    it("validates a short-circuit input schema", async () => {
        const definition = shortCircuit("gate", {
            condition: (ctx) => ctx.payload.rows > 0,
            input: v.object({ rows: v.number() }),
        });

        expect(
            valueOf(await validate(definition.input, { rows: 1 }))
        ).toStrictEqual({ rows: 1 });
        expect(
            issuesOf(await validate(definition.input, { rows: false })).length
        ).toBeGreaterThan(0);
    });
});
