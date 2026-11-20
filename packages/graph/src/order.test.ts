import { describe, expect, it } from "vitest";

import { createGraph } from "./graph";

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
