import { describe, expect, expectTypeOf, it } from "vitest";

import { assertTaskId, isTaskId, normalizeTaskId, taskIdError } from "./id";

describe("task id messages", () => {
    it("reports an empty id", () => {
        expect(taskIdError("")).toBe("Task ID cannot be empty");
    });

    it("reports a whitespace-only id", () => {
        expect(taskIdError(" \t\n")).toBe("Task ID cannot be empty");
    });

    it("reports an id longer than 250 characters", () => {
        const id = "a".repeat(251);

        expect(taskIdError(id)).toBe(
            `Task ID "${id}" must be at most 250 characters`
        );
    });

    it("reports invalid characters", () => {
        expect(taskIdError("load raw")).toBe(
            'Task ID "load raw" must use letters, numbers, ".", "-", or "_"'
        );
    });

    it("returns undefined for a valid id", () => {
        expect(taskIdError("load_orders-1.0")).toBeUndefined();
    });
});

describe("task id predicate", () => {
    it("is true for ids following Airflow's convention", () => {
        expect(isTaskId("extract")).toBeTruthy();
        expect(isTaskId("load.raw-2")).toBeTruthy();
    });

    it("is false for invalid ids", () => {
        expect(isTaskId("")).toBeFalsy();
        expect(isTaskId("load/raw")).toBeFalsy();
    });
});

describe("task id assertion", () => {
    it("throws the task id message for an invalid id", () => {
        expect(() => assertTaskId("load raw")).toThrow(
            'Task ID "load raw" must use letters, numbers, ".", "-", or "_"'
        );
    });

    it("throws for an empty id", () => {
        expect(() => assertTaskId("  ")).toThrow("Task ID cannot be empty");
    });

    it("returns without throwing for a valid id", () => {
        expect(() => assertTaskId("extract")).not.toThrow();
    });
});

describe("task id normalization", () => {
    it("trims surrounding whitespace and narrows the literal type", () => {
        expect(normalizeTaskId("  wait  ")).toBe("wait");
        expectTypeOf(normalizeTaskId("  wait  ")).toEqualTypeOf<"wait">();
    });

    it("keeps the trimmed id's literal type", () => {
        const id = normalizeTaskId("\n extract\t");

        expect(id).toBe("extract");
        expectTypeOf(id).toEqualTypeOf<"extract">();
    });

    it("throws when the trimmed id is invalid", () => {
        expect(() => normalizeTaskId(" load raw ")).toThrow(
            /must use letters/u
        );
    });

    it("throws when the trimmed id is empty", () => {
        expect(() => normalizeTaskId("   ")).toThrow("Task ID cannot be empty");
    });
});
