import type { AnyImplementation } from "@badag/dag";
import { createGraph } from "@badag/graph";
import type { GraphEdge, GraphNodeInput, GraphSpec } from "@badag/graph";
import { describe, expect, it } from "vitest";

import { run } from "./run";

function build(
    nodes: readonly GraphNodeInput[],
    edges: readonly GraphEdge[] = []
): GraphSpec {
    const graph = createGraph("test");

    graph.apply({ nodes, edges });

    return graph.spec();
}

function code(
    entries: Record<string, () => unknown>
): ReadonlyMap<string, AnyImplementation> {
    return new Map(
        Object.entries(entries).map(([key, fn]) => [key, { run: fn }] as const)
    );
}

const task = (key: string, config?: GraphNodeInput["config"]) => ({
    key,
    type: "task",
    config,
});

describe("executor", () => {
    it("runs a linear graph in order", async () => {
        const spec = build([task("a"), task("b")], [{ from: "a", to: "b" }]);

        const result = await run({
            spec,
            implementations: code({ a: () => 1, b: () => 2 }),
        });

        expect([...result.outcomes.keys()]).toStrictEqual(["a", "b"]);
        expect(result.outcomes.get("b")?.status).toBe("succeeded");
        expect(
            result.events.map((event) => `${event.type}:${event.key}`)
        ).toStrictEqual([
            "started:a",
            "succeeded:a",
            "started:b",
            "succeeded:b",
        ]);
    });

    it("runs the selected branch and skips the other", async () => {
        const spec = build(
            [
                task("start"),
                task("route", { role: "router" }),
                task("us"),
                task("eu"),
                task("publish", {
                    triggerRule: "none_failed_min_one_success",
                }),
            ],
            [
                { from: "start", to: "route" },
                { from: "route", to: "us", label: "us" },
                { from: "route", to: "eu", label: "eu" },
                { from: "us", to: "publish" },
                { from: "eu", to: "publish" },
            ]
        );

        const result = await run({
            spec,
            implementations: code({
                start: () => "go",
                route: () => "us",
                us: () => "priced",
                eu: () => "priced",
                publish: () => "published",
            }),
        });

        expect(result.outcomes.get("us")?.status).toBe("succeeded");
        expect(result.outcomes.get("eu")).toMatchObject({
            status: "skipped",
            reason: "no active route",
        });
        expect(result.outcomes.get("publish")?.status).toBe("succeeded");
    });

    it("reaches an explicit non-adjacent target through a skipped node", async () => {
        const spec = build(
            [
                task("route", { role: "router" }),
                task("mid"),
                task("target", { triggerRule: "all_done" }),
            ],
            [
                { from: "route", to: "mid", label: "other" },
                { from: "mid", to: "target" },
            ]
        );

        const result = await run({
            spec,
            implementations: code({
                route: () => "target",
                mid: () => "never",
                target: () => "reached",
            }),
        });

        expect(result.outcomes.get("mid")?.status).toBe("skipped");
        expect(result.outcomes.get("target")?.status).toBe("succeeded");
    });

    it("does not run across a failure under all_success", async () => {
        const spec = build(
            [
                task("fail"),
                task("afterAllSuccess", { triggerRule: "all_success" }),
                task("afterAllDone", { triggerRule: "all_done" }),
            ],
            [
                { from: "fail", to: "afterAllSuccess" },
                { from: "fail", to: "afterAllDone" },
            ]
        );

        const result = await run({
            spec,
            implementations: code({
                fail: () => {
                    throw new Error("boom");
                },
                afterAllSuccess: () => "no",
                afterAllDone: () => "yes",
            }),
        });

        expect(result.outcomes.get("fail")).toMatchObject({
            status: "failed",
            error: "boom",
        });
        expect(result.outcomes.get("afterAllSuccess")?.status).toBe("skipped");
        expect(result.outcomes.get("afterAllDone")?.status).toBe("succeeded");
    });

    it("runs a join when one upstream succeeded and one failed", async () => {
        const spec = build(
            [
                task("ok"),
                task("bad"),
                task("join", { triggerRule: "one_success" }),
            ],
            [
                { from: "ok", to: "join" },
                { from: "bad", to: "join" },
            ]
        );

        const result = await run({
            spec,
            implementations: code({
                ok: () => "value",
                bad: () => {
                    throw new Error("nope");
                },
                join: () => "joined",
            }),
        });

        expect(result.outcomes.get("join")?.status).toBe("succeeded");
    });

    it("fails a node with no implementation", async () => {
        const spec = build([task("orphan")]);

        const result = await run({ spec, implementations: code({}) });

        expect(result.outcomes.get("orphan")).toMatchObject({
            status: "failed",
            error: 'Node "orphan" has no implementation',
        });
    });

    it("fails a node with an unknown role or policy", async () => {
        const badRole = build([task("a", { role: "boss" })]);

        const badPolicy = build(
            [task("a"), task("b", { triggerRule: "always" })],
            [{ from: "a", to: "b" }]
        );

        const roleResult = await run({
            spec: badRole,
            implementations: code({ a: () => 1 }),
        });

        const policyResult = await run({
            spec: badPolicy,
            implementations: code({ a: () => 1, b: () => 2 }),
        });

        expect(roleResult.outcomes.get("a")?.status).toBe("failed");
        expect(policyResult.outcomes.get("b")?.status).toBe("failed");
    });

    it("fails a router that returns something other than strings", async () => {
        const spec = build([task("route", { role: "router" })]);

        const result = await run({
            spec,
            implementations: code({ route: () => 42 }),
        });

        expect(result.outcomes.get("route")).toMatchObject({
            status: "failed",
        });
    });

    it("fails a router that selects an unknown label or key", async () => {
        const spec = build([task("route", { role: "router" })]);

        const result = await run({
            spec,
            implementations: code({ route: () => "nowhere" }),
        });

        expect(result.outcomes.get("route")).toMatchObject({
            status: "failed",
        });
        expect(result.outcomes.get("route")?.error).toContain("nowhere");
    });

    it("retries a failing node and reports the successful attempt", async () => {
        const spec = build([task("flaky", { retries: 2 })]);

        let calls = 0;

        const result = await run({
            spec,
            implementations: code({
                flaky: () => {
                    calls += 1;

                    if (calls < 2) {
                        throw new Error("again");
                    }

                    return "ok";
                },
            }),
        });

        expect(result.outcomes.get("flaky")).toMatchObject({
            status: "succeeded",
            attempt: 2,
        });
        expect(calls).toBe(2);
        expect(
            result.events.filter(
                (event) => event.key === "flaky" && event.type === "started"
            )
        ).toHaveLength(2);
    });

    it("fails after exhausting retries", async () => {
        const spec = build([task("doomed", { retries: 1 })]);

        const result = await run({
            spec,
            implementations: code({
                doomed: () => {
                    throw new Error("always");
                },
            }),
        });

        expect(result.outcomes.get("doomed")).toMatchObject({
            status: "failed",
            attempt: 2,
            error: "always",
        });
    });

    it("awaits waiter implementations", async () => {
        const spec = build([task("wait", { role: "waiter" })]);

        const result = await run({
            spec,
            implementations: code({
                wait: async () => {
                    await Promise.resolve();

                    return true;
                },
            }),
        });

        expect(result.outcomes.get("wait")?.status).toBe("succeeded");
    });

    it("is deterministic across runs", async () => {
        const spec = build(
            [
                task("a"),
                task("route", { role: "router" }),
                task("us"),
                task("eu"),
            ],
            [
                { from: "a", to: "route" },
                { from: "route", to: "us", label: "us" },
                { from: "route", to: "eu", label: "eu" },
            ]
        );

        const implementations = code({
            a: () => 1,
            route: () => "us",
            us: () => 2,
            eu: () => 3,
        });

        const first = await run({ spec, implementations });
        const second = await run({ spec, implementations });

        expect([...second.events]).toStrictEqual([...first.events]);
        expect([...second.outcomes]).toStrictEqual([...first.outcomes]);
    });

    it("rejects a structurally invalid spec", async () => {
        const spec: GraphSpec = {
            specVersion: 1,
            key: "cycle",
            revision: "test",
            nodes: [
                { key: "a", type: "task", config: {} },
                { key: "b", type: "task", config: {} },
            ],
            edges: [
                { from: "a", to: "b" },
                { from: "b", to: "a" },
            ],
        };

        await expect(
            run({ spec, implementations: code({ a: () => 1 }) })
        ).rejects.toThrow(/invalid/u);
    });
});
