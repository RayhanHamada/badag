import { describe, expect, expectTypeOf, it } from "vitest";

import { defineNode } from "./definition";
import { schema } from "./test-schema";

const run = (): string => "ok";

describe("node definitions", () => {
    it("keeps the key, type, config, and callback", () => {
        const node = defineNode({
            key: "extract",
            type: "task",
            config: { retries: 2 },
            run,
        });

        expect(node.key).toBe("extract");
        expect(node.type).toBe("task");
        expect(node.config).toStrictEqual({ retries: 2 });

        const { implementation } = node;

        if (implementation === undefined) {
            throw new Error("expected an implementation");
        }

        expect(implementation.run).toBe(run);
    });

    it("keeps the declared config shape in the type", () => {
        const node = defineNode({
            key: "extract",
            type: "task",
            config: { retries: 2 },
        });

        expectTypeOf(node.config).toEqualTypeOf<{ retries: number }>();
    });

    it("declares a node without code", () => {
        const node = defineNode({ key: "notify", type: "trigger" });

        expect(node.implementation).toBeUndefined();
        expect(node.key).toBe("notify");
    });

    it("defaults config to an empty frozen object", () => {
        const node = defineNode({ key: "a", type: "task", run: () => 1 });

        expect(node.config).toStrictEqual({});
        expect(Object.isFrozen(node)).toBeTruthy();
        expect(Object.isFrozen(node.config)).toBeTruthy();
        expect(Object.isFrozen(node.implementation)).toBeTruthy();
    });

    it("keeps the declared schemas", () => {
        const input = schema<string>();
        const output = schema<number>();

        const node = defineNode({
            key: "a",
            type: "task",
            input,
            output,
            run: (ctx) => ctx.payload.length,
        });

        const { implementation } = node;

        if (implementation === undefined) {
            throw new Error("expected an implementation");
        }

        expect(implementation.input).toBe(input);
        expect(implementation.output).toBe(output);
    });

    it("freezes config at every level", () => {
        const node = defineNode({
            key: "a",
            type: "task",
            config: { nested: { retries: 2 } },
        });

        expect(Object.isFrozen(node.config.nested)).toBeTruthy();
    });

    it("rejects an empty key or type", () => {
        expect(() =>
            defineNode({ key: " ", type: "task", run: () => 1 })
        ).toThrow(/Node key/u);
        expect(() => defineNode({ key: "a", type: " ", run: () => 1 })).toThrow(
            /non-empty type/u
        );
    });
});
