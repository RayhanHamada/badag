import { describe, expect, expectTypeOf, it } from "vitest";

import { DEFAULT_TRIGGER_RULE, TRIGGER_RULE_ENUM } from "./trigger-rule";
import type { TriggerRule } from "./trigger-rule";

describe("trigger rules", () => {
    it("lists exactly the seven documented rules", () => {
        expect(TRIGGER_RULE_ENUM).toStrictEqual({
            AllSuccess: "all_success",
            AllDone: "all_done",
            OneSuccess: "one_success",
            OneFailed: "one_failed",
            NoneFailed: "none_failed",
            NoneFailedMinOneSuccess: "none_failed_min_one_success",
            AllSkipped: "all_skipped",
        });
        expect(Object.keys(TRIGGER_RULE_ENUM)).toHaveLength(7);
    });

    it("types each rule as its literal", () => {
        expectTypeOf(TRIGGER_RULE_ENUM.AllDone).toEqualTypeOf<"all_done">();
        expectTypeOf(
            TRIGGER_RULE_ENUM.NoneFailedMinOneSuccess
        ).toEqualTypeOf<"none_failed_min_one_success">();
    });

    it("accepts every enum value as a TriggerRule", () => {
        expectTypeOf<TriggerRule>().toEqualTypeOf<
            | "all_success"
            | "all_done"
            | "one_success"
            | "one_failed"
            | "none_failed"
            | "none_failed_min_one_success"
            | "all_skipped"
        >();

        const rules: TriggerRule[] = Object.values(TRIGGER_RULE_ENUM);

        expect(rules).toHaveLength(7);
    });
});

describe("default trigger rule", () => {
    it("is all_success", () => {
        expect(DEFAULT_TRIGGER_RULE).toBe("all_success");
        expect(DEFAULT_TRIGGER_RULE).toBe(TRIGGER_RULE_ENUM.AllSuccess);
        expectTypeOf(DEFAULT_TRIGGER_RULE).toEqualTypeOf<"all_success">();
    });
});
