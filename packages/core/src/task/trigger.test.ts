import type { StandardSchemaV1 } from "@standard-schema/spec";
import { type } from "arktype";
import { describe, expect, expectTypeOf, it } from "vitest";

import { createDAG } from "../dag/dag";
import type { AnySchema } from "./base";
import { TASK_KIND_ENUM } from "./kind";
import { trigger } from "./trigger";
import type { TriggerTaskDefinition } from "./trigger";
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

describe("schemas on every task kind", () => {
    it("validates a trigger output schema", async () => {
        const definition = trigger("start", {
            dagId: "child",
            output: type("boolean"),
        });

        expect(valueOf(await validate(definition.output, true))).toBeTruthy();
        expect(
            issuesOf(await validate(definition.output, "yes")).length
        ).toBeGreaterThan(0);
    });
});
