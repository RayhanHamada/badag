import { describe, expect, expectTypeOf, it } from "vitest";

import { defineNode } from "./definition";
import { schema } from "./test-schema";

const run = (): string => "ok";

const SHA256_HEX = /^[0-9a-f]{64}$/u;

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

    it("keeps the declared output schema", () => {
        const output = schema<number>();

        const node = defineNode({
            key: "a",
            type: "task",
            output,
            run: () => 1,
        });

        const { implementation } = node;

        if (implementation === undefined) {
            throw new Error("expected an implementation");
        }

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

    it("hashes type, config, and behavior, not the key", async () => {
        const first = defineNode({
            key: "extract",
            type: "task",
            config: { retries: 2 },
            run,
        });

        const second = defineNode({
            key: "load",
            type: "task",
            config: { retries: 2 },
            run,
        });

        await expect(first.hash()).resolves.toMatch(SHA256_HEX);
        await expect(second.hash()).resolves.toBe(await first.hash());
    });

    it("ignores the description", async () => {
        const first = defineNode({
            key: "extract",
            type: "task",
            config: { description: "Raw extraction" },
            run,
        });

        const second = defineNode({
            key: "extract",
            type: "task",
            config: { description: "Something else" },
            run,
        });

        await expect(second.hash()).resolves.toBe(await first.hash());
    });

    it("changes with type, config, or behavior", async () => {
        const base = defineNode({
            key: "a",
            type: "task",
            config: { retries: 2 },
            run,
        });

        const type = defineNode({
            key: "a",
            type: "sensor",
            config: { retries: 2 },
            run,
        });

        const config = defineNode({
            key: "a",
            type: "task",
            config: { retries: 3 },
            run,
        });

        const behavior = defineNode({
            key: "a",
            type: "task",
            config: { retries: 2 },
            run: () => "different",
        });

        const hashes = await Promise.all(
            [base, type, config, behavior].map((node) => node.hash())
        );

        expect(new Set(hashes).size).toBe(4);
    });

    it("distinguishes a declaration without code from a callback", async () => {
        const withoutRun = defineNode({ key: "a", type: "delay" });

        const withRun = defineNode({
            key: "a",
            type: "delay",
            run: () => 1,
        });

        await expect(withoutRun.hash()).resolves.not.toBe(await withRun.hash());
    });

    it("uses hashSource instead of the registered callback source", async () => {
        const first = defineNode({
            key: "a",
            type: "short_circuit",
            hashSource: "() => true",
            run: () => "run",
        });

        const second = defineNode({
            key: "a",
            type: "short_circuit",
            hashSource: "() => false",
            run: () => "run",
        });

        await expect(first.hash()).resolves.not.toBe(await second.hash());
    });

    it("caches the hash promise", () => {
        const node = defineNode({ key: "a", type: "task", run });

        expect(node.hash()).toBe(node.hash());
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
