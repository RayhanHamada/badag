import { describe, expect, expectTypeOf, it } from "vitest";

import { TASK_KIND_ENUM } from "./kind";
import type { TaskKind } from "./kind";

describe("task kinds", () => {
    it("lists exactly the six supported kinds", () => {
        expect(TASK_KIND_ENUM).toStrictEqual({
            Task: "task",
            Sensor: "sensor",
            Delay: "delay",
            Branch: "branch",
            ShortCircuit: "short_circuit",
            Trigger: "trigger",
        });
        expect(Object.keys(TASK_KIND_ENUM)).toHaveLength(6);
    });

    it("types each kind as its literal", () => {
        expectTypeOf(TASK_KIND_ENUM.Task).toEqualTypeOf<"task">();
        expectTypeOf(TASK_KIND_ENUM.Sensor).toEqualTypeOf<"sensor">();
        expectTypeOf(TASK_KIND_ENUM.Delay).toEqualTypeOf<"delay">();
        expectTypeOf(TASK_KIND_ENUM.Branch).toEqualTypeOf<"branch">();
        expectTypeOf(
            TASK_KIND_ENUM.ShortCircuit
        ).toEqualTypeOf<"short_circuit">();
        expectTypeOf(TASK_KIND_ENUM.Trigger).toEqualTypeOf<"trigger">();
    });

    it("covers every enum value in TaskKind", () => {
        expectTypeOf<TaskKind>().toEqualTypeOf<
            "task" | "sensor" | "delay" | "branch" | "short_circuit" | "trigger"
        >();
    });
});
