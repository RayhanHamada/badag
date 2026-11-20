import { describe, expect, it } from "vitest";

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
        expect(node.implementation.run).toBe(run);
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

        expect(node.implementation.input).toBe(input);
        expect(node.implementation.output).toBe(output);
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
