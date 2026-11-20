import { describe, expect, it } from "vitest";

import { AIRFLOW_KEY_MAX_LENGTH, assertAirflowKey, isAirflowKey } from "./keys";

describe("airflow keys", () => {
    it("accepts letters, numbers, underscore, dot, and dash", () => {
        expect(isAirflowKey("extract_1.us-eu")).toBeTruthy();
        expect(isAirflowKey("ÉTL")).toBeTruthy();
    });

    it("rejects empty, spaced, and overlong keys", () => {
        expect(isAirflowKey("")).toBeFalsy();
        expect(isAirflowKey("has space")).toBeFalsy();
        expect(
            isAirflowKey("a".repeat(AIRFLOW_KEY_MAX_LENGTH + 1))
        ).toBeFalsy();
        expect(() => assertAirflowKey("Node key", "bad/key")).toThrow(
            /Node key/u
        );
    });
});
