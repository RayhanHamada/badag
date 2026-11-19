import type { StandardSchemaV1 } from "@standard-schema/spec";
import { type } from "arktype";
import { describe, expect, expectTypeOf, it } from "vitest";

import { createDAG } from "../dag/dag";
import type { AnySchema, SchemaOf } from "./base";
import { branch } from "./branch";
import type { BranchChoice } from "./branch";
import { TASK_KIND_ENUM } from "./kind";
import { task } from "./task";
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

describe("schemas on every task kind", () => {
    it("validates a branch input schema", async () => {
        const definition = branch("route", {
            branches: ["big", "small"],
            choose: (ctx) => (ctx.payload.rows > 10 ? "big" : "small"),
            input: type({ rows: "number" }),
        });

        expect(
            valueOf(await validate(definition.input, { rows: 21 }))
        ).toStrictEqual({ rows: 21 });
        expect(
            issuesOf(await validate(definition.input, { rows: "x" })).length
        ).toBeGreaterThan(0);
    });
});
