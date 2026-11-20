/**
 * Topological order over a spec loaded from storage.
 *
 * The builder and the runtime use the same function, so a graph loaded from
 * JSON is ordered exactly like one built in memory. Ties are broken by the
 * spec's node order.
 */

import type { GraphCheckInput } from "./check";

/**
 * Return every node key in a valid execution order.
 *
 * Throws when an edge references an unknown node or the graph is cyclic.
 */
export function orderSpec(spec: GraphCheckInput): readonly string[] {
    const indegree = new Map<string, number>();
    const downstream = new Map<string, Set<string>>();
    const upstream = new Map<string, Set<string>>();

    for (const node of spec.nodes) {
        if (indegree.has(node.key)) {
            throw new Error(
                `Node "${node.key}" is declared more than once in graph "${spec.key}"`
            );
        }

        indegree.set(node.key, 0);
    }

    for (const edge of spec.edges) {
        if (!indegree.has(edge.from)) {
            throw new Error(
                `Edge source "${edge.from}" is not registered in graph "${spec.key}"`
            );
        }

        if (!indegree.has(edge.to)) {
            throw new Error(
                `Edge target "${edge.to}" is not registered in graph "${spec.key}"`
            );
        }

        const targets = downstream.get(edge.from) ?? new Set<string>();
        const sources = upstream.get(edge.to) ?? new Set<string>();

        if (targets.has(edge.to)) {
            continue;
        }

        targets.add(edge.to);
        sources.add(edge.from);
        downstream.set(edge.from, targets);
        upstream.set(edge.to, sources);
        indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    }

    const ready: string[] = [];

    for (const [key, count] of indegree) {
        if (count === 0) {
            ready.push(key);
        }
    }

    const ordered: string[] = [];

    // The queue grows while it is walked, so for...of would stop early.
    // oxlint-disable-next-line typescript/prefer-for-of
    for (let index = 0; index < ready.length; index += 1) {
        const key = ready[index];

        ordered.push(key);

        for (const next of downstream.get(key) ?? []) {
            const count = indegree.get(next);

            if (count === undefined) {
                throw new Error(
                    `Node "${next}" is not registered in graph "${spec.key}"`
                );
            }

            indegree.set(next, count - 1);

            if (count === 1) {
                ready.push(next);
            }
        }
    }

    if (ordered.length !== spec.nodes.length) {
        throw new Error(`Graph "${spec.key}" contains a cycle`);
    }

    return ordered;
}
