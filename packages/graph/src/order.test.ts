import { describe, expect, it } from "vitest";

import type { GraphCheckInput } from "./check";
import { createGraph } from "./graph";
import { orderSpec } from "./order";

const RANGE = 4_294_967_296;

/** Deterministic pseudo-random sequence; the test must never flake. */
function sequence(seed: number): () => number {
    let state = seed % RANGE;

    return () => {
        state = (Math.imul(state, 1_664_525) + 1_013_904_223 + RANGE) % RANGE;

        return state / RANGE;
    };
}

describe("order", () => {
    it("orders a spec loaded from storage", () => {
        const spec: GraphCheckInput = {
            key: "loaded",
            nodes: [
                { key: "load", type: "task", config: {} },
                { key: "extract", type: "task", config: {} },
                { key: "transform", type: "task", config: {} },
            ],
            edges: [
                { from: "extract", to: "transform" },
                { from: "transform", to: "load" },
            ],
        };

        expect(orderSpec(spec)).toStrictEqual(["extract", "transform", "load"]);
    });

    it("rejects a loaded spec with a cycle or an unknown endpoint", () => {
        expect(() =>
            orderSpec({
                key: "cycle",
                nodes: [
                    { key: "a", type: "task", config: {} },
                    { key: "b", type: "task", config: {} },
                ],
                edges: [
                    { from: "a", to: "b" },
                    { from: "b", to: "a" },
                ],
            })
        ).toThrow(/cycle/u);

        expect(() =>
            orderSpec({
                key: "broken",
                nodes: [{ key: "a", type: "task", config: {} }],
                edges: [{ from: "a", to: "ghost" }],
            })
        ).toThrow(/ghost/u);
    });

    it("respects every edge over generated DAGs", () => {
        for (let seed = 1; seed <= 50; seed += 1) {
            const random = sequence(seed);
            const size = 1 + Math.floor(random() * 20);

            const keys = Array.from(
                { length: size },
                (_, index) => `n${index}`
            );

            const insertion = [...keys];

            for (let index = insertion.length - 1; index > 0; index -= 1) {
                const swap = Math.floor(random() * (index + 1));
                const value = insertion[index];

                insertion[index] = insertion[swap];
                insertion[swap] = value;
            }

            const graph = createGraph(`generated-${seed}`);

            graph.addNodes(insertion.map((key) => ({ key, type: "task" })));

            for (let from = 0; from < keys.length; from += 1) {
                for (let to = from + 1; to < keys.length; to += 1) {
                    if (random() < 0.25) {
                        graph.link(keys[from], keys[to]);
                    }
                }
            }

            const order = graph.order();

            const position = new Map(
                order.map((key, index) => [key, index] as const)
            );

            expect(order).toHaveLength(size);
            expect(position.size).toBe(size);

            for (const edge of graph.edges()) {
                const from = position.get(edge.from);
                const to = position.get(edge.to);

                expect(from).toBeDefined();
                expect(to).toBeDefined();
                expect(from ?? Number.POSITIVE_INFINITY).toBeLessThan(
                    to ?? Number.NEGATIVE_INFINITY
                );
            }
        }
    });
});
