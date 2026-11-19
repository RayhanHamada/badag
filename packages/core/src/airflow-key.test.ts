import { describe, expect, it } from "vitest";

import {
    AIRFLOW_KEY_MAX_LENGTH,
    AIRFLOW_KEY_PATTERN,
    keyError,
} from "./airflow-key";

describe("Airflow key length", () => {
    it("matches Airflow's 250 character limit", () => {
        expect(AIRFLOW_KEY_MAX_LENGTH).toBe(250);
    });

    it("accepts a key at the limit and rejects one past it", () => {
        expect(keyError("DAG id", "a".repeat(250))).toBeUndefined();
        expect(keyError("DAG id", "a".repeat(251))).toBe(
            `DAG id "${"a".repeat(251)}" must be at most 250 characters`
        );
    });
});

describe("Airflow key pattern", () => {
    it("accepts letters, numbers, dots, dashes, underscores, and unicode", () => {
        for (const key of [
            "etl",
            "dag_1",
            "load.raw",
            "extract-orders",
            "données",
            "日本語",
        ]) {
            expect(AIRFLOW_KEY_PATTERN.test(key)).toBeTruthy();
        }
    });

    it("rejects spaces, slashes, and empty keys", () => {
        for (const key of ["extract orders", "path/to", "load/raw", ""]) {
            expect(AIRFLOW_KEY_PATTERN.test(key)).toBeFalsy();
        }
    });
});

describe("key validation messages", () => {
    it("reports an empty key", () => {
        expect(keyError("DAG id", "")).toBe("DAG id cannot be empty");
    });

    it("reports a whitespace-only key", () => {
        expect(keyError("Task ID", " \t\n ")).toBe("Task ID cannot be empty");
    });

    it("reports invalid characters with the exact label and value", () => {
        expect(keyError("Task ID", "load raw")).toBe(
            'Task ID "load raw" must use letters, numbers, ".", "-", or "_"'
        );
        expect(keyError("DAG id", "path/to")).toBe(
            'DAG id "path/to" must use letters, numbers, ".", "-", or "_"'
        );
    });

    it("returns undefined for valid keys", () => {
        expect(keyError("DAG id", "nightly_etl-1.0")).toBeUndefined();
        expect(keyError("Task ID", "extract")).toBeUndefined();
    });
});
