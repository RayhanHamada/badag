import type { Implementation, MaybePromise, NodeContext } from "@badag/dag";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { describe, expect, expectTypeOf, it } from "vitest";

import { branch, delay, sensor, shortCircuit, task, trigger } from "./presets";
import { TRIGGER_RULE_ENUM } from "./trigger-rule";

function schema<Value>(): StandardSchemaV1<Value, Value> {
    return {
        "~standard": {
            version: 1,
            vendor: "badag-test",
            // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Standard Schema validate receives unknown.
            validate: (value: unknown) => ({
                // SAFETY: the fixture stands in for validation; the type
                // argument is the contract under test.
                value: value as Value,
            }),
        },
    };
}

function implementationOf<
    Node extends { readonly implementation?: Implementation },
>(node: Node): NonNullable<Node["implementation"]> {
    const { implementation } = node;

    if (implementation === undefined) {
        throw new Error("expected an implementation");
    }

    return implementation;
}

describe("presets", () => {
    it("builds a task with metadata", () => {
        const node = task("extract", {
            description: "Read source",
            triggerRule: TRIGGER_RULE_ENUM.AllDone,
            config: { retries: 2 },
            run: () => "raw",
        });

        expect(node.type).toBe("task");
        expect(node.config).toMatchObject({
            role: "compute",
            description: "Read source",
            triggerRule: "all_done",
            retries: 2,
        });
    });

    it("builds a branch router with its declared labels", async () => {
        const node = branch("route", {
            branches: ["us", "eu"] as const,
            choose: () => "us",
        });

        expect(node.type).toBe("branch");
        expect(node.config).toMatchObject({
            role: "router",
            branches: ["us", "eu"],
        });
        await expect(
            Promise.resolve(
                implementationOf(node).run({
                    key: "route",
                    payload: undefined,
                })
            )
        ).resolves.toBe("us");
    });

    it("builds a sensor waiter", async () => {
        const node = sensor("wait", {
            predicate: () => true,
            pokeIntervalMs: 1000,
        });

        expect(node.config).toMatchObject({
            role: "waiter",
            pokeIntervalMs: 1000,
        });
        await expect(
            Promise.resolve(
                implementationOf(node).run({
                    key: "wait",
                    payload: undefined,
                })
            )
        ).resolves.toBeTruthy();
    });

    it("builds a delay without code", () => {
        const node = delay("settle", { durationMs: 500 });

        expect(node.type).toBe("delay");
        expect(node.config).toMatchObject({
            role: "waiter",
            durationMs: 500,
        });
        expect(node.implementation).toBeUndefined();
    });

    it("maps a short-circuit condition to run or skip", async () => {
        const node = shortCircuit("gate", { condition: () => false });

        expect(node.config).toMatchObject({
            role: "router",
            branches: ["run", "skip"],
        });
        await expect(
            Promise.resolve(
                implementationOf(node).run({
                    key: "gate",
                    payload: undefined,
                })
            )
        ).resolves.toBe("skip");
    });

    it("builds a trigger without code", () => {
        const node = trigger("launch", { dagId: "nightly" });

        expect(node.config).toMatchObject({
            role: "compute",
            dagId: "nightly",
            waitForCompletion: false,
        });
        expect(node.implementation).toBeUndefined();
    });

    it("validates preset keys and timing", () => {
        expect(() => task("bad key", { run: () => 1 })).toThrow(/Node key/u);
        expect(() => delay("d", { durationMs: -1 })).toThrow(/greater than/u);
        expect(() =>
            sensor("s", { predicate: () => true, pokeIntervalMs: 0 })
        ).toThrow(/greater than 0/u);
        expect(() => trigger("t", { dagId: "bad id" })).toThrow(/DAG id/u);
    });

    it("types the task payload from its input schema", () => {
        const node = task("extract", {
            input: schema<string>(),
            run: (ctx) => ctx.payload.length,
        });

        expectTypeOf(implementationOf(node).run)
            .parameter(0)
            .toEqualTypeOf<NodeContext<"extract", string>>();
        expectTypeOf(implementationOf(node).run).returns.toEqualTypeOf<
            MaybePromise<unknown>
        >();
    });

    it("narrows branch names to the declared tuple", () => {
        const node = branch("route", {
            branches: ["us", "eu"] as const,
            choose: () => "us",
        });

        expect(node.key).toBe("route");

        branch("route", {
            branches: ["us", "eu"] as const,
            // @ts-expect-error "apac" is not a declared branch
            choose: () => "apac",
        });
    });
});
