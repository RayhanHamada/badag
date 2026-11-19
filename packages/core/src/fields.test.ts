import { describe, expect, it } from "vitest";

import { definedFields } from "./fields";

describe("defined fields", () => {
    it("removes properties whose value is undefined", () => {
        expect(definedFields({ kept: 1, dropped: undefined })).toStrictEqual({
            kept: 1,
        });
    });

    it("keeps falsy and null values", () => {
        const value = definedFields({
            zero: 0,
            empty: "",
            no: false,
            nil: null,
        });

        expect(value).toStrictEqual({
            zero: 0,
            empty: "",
            no: false,
            nil: null,
        });
    });

    it("preserves insertion order around removed properties", () => {
        const value = definedFields({
            second: 2,
            dropped: undefined,
            first: 1,
        });

        expect(Object.keys(value)).toStrictEqual(["second", "first"]);
    });

    it("returns the same object reference", () => {
        const input = { kept: "yes", dropped: undefined };

        expect(definedFields(input)).toBe(input);
    });

    it("leaves an object without undefined fields unchanged", () => {
        const input = { description: "Read data", kind: "task" };

        expect(definedFields(input)).toBe(input);
        expect(definedFields(input)).toStrictEqual(input);
    });

    it("returns an empty object untouched", () => {
        const input = {};

        expect(definedFields(input)).toBe(input);
        expect(Object.keys(input)).toStrictEqual([]);
    });
});
