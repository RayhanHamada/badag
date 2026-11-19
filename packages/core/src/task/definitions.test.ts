import { describe, expect, expectTypeOf, it } from "vitest";

import type { AnySchema, AnyTaskFn, TaskFn } from "./base";
import { branch } from "./branch";
import type {
    AnyTaskDefinition,
    RegisteredTaskDefinition,
} from "./definitions";
import { delay } from "./delay";
import { sensor } from "./sensor";
import { shortCircuit } from "./short-circuit";
import { task } from "./task";
import type { TaskParamOutput } from "./task";
import { trigger } from "./trigger";

const KINDS = [
    "task",
    "sensor",
    "delay",
    "branch",
    "short_circuit",
    "trigger",
] as const;

const regular = task("regular", { fn: () => 0 });
const sensed = sensor("sensed", { predicate: () => true });
const delayed = delay("delayed", { durationMs: 0 });
const picked = branch("picked", { branches: ["a"], choose: () => "a" });
const gated = shortCircuit("gated", { condition: () => true });
const started = trigger("started", { dagId: "child" });

const definitions = [regular, sensed, delayed, picked, gated, started];

// The registered union erases literals, so each factory is instantiated with a
// widened id and `AnySchema` to match it.
const registered = [
    task<string, AnySchema, AnySchema>("regular", { fn: () => 0 }),
    sensor<string, AnySchema, AnySchema>("sensed", { predicate: () => true }),
    delay<string, AnySchema, AnySchema>("delayed", { durationMs: 0 }),
    branch<string, readonly string[], AnySchema, AnySchema>("picked", {
        branches: ["a"],
        choose: () => "a",
    }),
    shortCircuit<string, AnySchema, AnySchema>("gated", {
        condition: () => true,
    }),
    trigger<string, AnySchema, AnySchema>("started", { dagId: "child" }),
] satisfies RegisteredTaskDefinition[];

/** Return the field only the given kind declares, checking its type first. */
function specificField(definition: AnyTaskDefinition): unknown {
    if (definition.kind === "sensor") {
        expectTypeOf(definition.predicate).toEqualTypeOf<AnyTaskFn>();

        return definition.predicate;
    }

    if (definition.kind === "delay") {
        expectTypeOf(definition.durationMs).toEqualTypeOf<number>();

        return definition.durationMs;
    }

    if (definition.kind === "trigger") {
        expectTypeOf(definition.dagId).toEqualTypeOf<string>();

        return definition.dagId;
    }

    if (definition.kind === "branch") {
        expectTypeOf(definition.choose).toEqualTypeOf<AnyTaskFn>();

        return definition.choose;
    }

    if (definition.kind === "short_circuit") {
        expectTypeOf(definition.condition).toEqualTypeOf<AnyTaskFn>();

        return definition.condition;
    }

    expectTypeOf(definition.fn).toEqualTypeOf<AnyTaskFn>();

    return definition.fn;
}

describe("task definition unions", () => {
    it("accepts every factory output", () => {
        expect(definitions.map(({ kind }) => kind)).toStrictEqual([...KINDS]);
        expect(registered.map(({ kind }) => kind)).toStrictEqual([...KINDS]);
        expectTypeOf(definitions).toExtend<AnyTaskDefinition[]>();
        expectTypeOf(registered).toExtend<RegisteredTaskDefinition[]>();
    });

    it("erases literals in the registered view", () => {
        expectTypeOf<
            TaskParamOutput<string, TaskFn, AnySchema, AnySchema>
        >().toExtend<RegisteredTaskDefinition>();
        expectTypeOf<AnyTaskDefinition["kind"]>().toEqualTypeOf<
            (typeof KINDS)[number]
        >();
        expectTypeOf<RegisteredTaskDefinition["kind"]>().toEqualTypeOf<
            AnyTaskDefinition["kind"]
        >();
    });
});

describe("narrowing by kind", () => {
    it("exposes each kind's specific field", () => {
        expect(definitions.map(specificField)).toStrictEqual([
            regular.fn,
            sensed.predicate,
            0,
            picked.choose,
            gated.condition,
            "child",
        ]);
    });
});
