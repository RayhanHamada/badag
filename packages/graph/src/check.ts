/**
 * Structural findings: the four problems a spec can have on its own.
 *
 * `checkSpec` is a pure function, so a spec loaded from storage and one built
 * in memory cross the same seam. It never throws: an unknown endpoint is a
 * finding, not a crash.
 */

import type { GraphEdge, GraphNode } from "./spec";

/** Machine-readable categories for structural findings. */
export const GRAPH_FINDING_CODE = {
    /** A node key appears more than once in the spec. */
    DuplicateNode: "duplicate-node",
    /** An edge endpoint is not declared in the spec. */
    UnknownNode: "unknown-node",
    /** A node lists itself as an edge endpoint. */
    SelfEdge: "self-edge",
    /** Following edges returns to a node already on the path. */
    Cycle: "cycle",
} as const;

/** A category reported by `checkSpec`. */
export type GraphFindingCode =
    (typeof GRAPH_FINDING_CODE)[keyof typeof GRAPH_FINDING_CODE];

/**
 * One structural problem in a graph.
 *
 * `subjects` holds the values the message names, in order: the node key for a
 * duplicate or self edge, the missing endpoint keys for an unknown node, and
 * the traversal path (closing node repeated) for a cycle.
 */
export interface GraphFinding {
    readonly code: GraphFindingCode;
    readonly subjects: readonly string[];
    readonly message: string;
}

interface Frame {
    readonly key: string;
    index: number;
}

function declareNodes(
    nodes: readonly GraphNode[],
    push: (finding: GraphFinding) => void
): Map<string, GraphNode> {
    const byKey = new Map<string, GraphNode>();

    for (const node of nodes) {
        if (byKey.has(node.key)) {
            push({
                code: GRAPH_FINDING_CODE.DuplicateNode,
                subjects: [node.key],
                message: `Node "${node.key}" is declared more than once`,
            });

            continue;
        }

        byKey.set(node.key, node);
    }

    return byKey;
}

function declareEdges(
    edges: readonly GraphEdge[],
    nodes: ReadonlyMap<string, GraphNode>,
    push: (finding: GraphFinding) => void
): GraphEdge[] {
    const traversable: GraphEdge[] = [];

    for (const edge of edges) {
        const missing = [edge.from, edge.to].filter((key) => !nodes.has(key));

        if (missing.length > 0) {
            const names = missing.map((key) => `"${key}"`).join(", ");
            const noun = missing.length === 1 ? "node" : "nodes";

            push({
                code: GRAPH_FINDING_CODE.UnknownNode,
                subjects: missing,
                message: `Edge "${edge.from}" -> "${edge.to}" references unknown ${noun} ${names}`,
            });
        }

        if (edge.from === edge.to) {
            push({
                code: GRAPH_FINDING_CODE.SelfEdge,
                subjects: [edge.from],
                message: `Node "${edge.from}" cannot depend on itself`,
            });
        }

        if (missing.length === 0 && edge.from !== edge.to) {
            traversable.push(edge);
        }
    }

    return traversable;
}

function findCycles(
    keys: Iterable<string>,
    adjacency: ReadonlyMap<string, readonly string[]>,
    graphKey: string,
    push: (finding: GraphFinding) => void
): void {
    // 0 = unvisited (absent), 1 = on the current path, 2 = finished.
    const color = new Map<string, 1 | 2>();

    for (const root of keys) {
        if (color.has(root)) {
            continue;
        }

        color.set(root, 1);

        const stack: Frame[] = [{ key: root, index: 0 }];

        while (stack.length > 0) {
            const frame = stack.at(-1);

            if (frame === undefined) {
                break;
            }

            const next = adjacency.get(frame.key)?.[frame.index];

            if (next === undefined) {
                color.set(frame.key, 2);
                stack.pop();

                continue;
            }

            frame.index += 1;

            const state = color.get(next);

            if (state === 1) {
                const path = stack.map((entry) => entry.key);
                const start = path.indexOf(next);
                const cycle = [...path.slice(start), next];

                push({
                    code: GRAPH_FINDING_CODE.Cycle,
                    subjects: cycle,
                    message: `Graph "${graphKey}" contains a cycle: ${cycle.join(" -> ")}`,
                });

                continue;
            }

            if (state === undefined) {
                color.set(next, 1);
                stack.push({ key: next, index: 0 });
            }
        }
    }
}

/** The structural part of a spec; a full `GraphSpec` is assignable. */
export interface GraphCheckInput {
    readonly key: string;
    readonly nodes: readonly GraphNode[];
    readonly edges: readonly GraphEdge[];
}

/**
 * Return every structural problem in a spec, without throwing.
 *
 * A self edge is reported as `self-edge`, never additionally as a cycle. Each
 * distinct cycle is reported once, at the back edge that closes it, so a
 * figure-eight reports two findings.
 */
export function checkSpec(spec: GraphCheckInput): readonly GraphFinding[] {
    const findings: GraphFinding[] = [];
    const seen = new Set<string>();

    const push = (finding: GraphFinding): void => {
        // Deduplicate the exact finding, not every finding that names the same
        // subject: two different edges into one missing node are two problems.
        const id = `${finding.code}\u0000${finding.subjects.join("\u0000")}\u0000${finding.message}`;

        if (seen.has(id)) {
            return;
        }

        seen.add(id);
        findings.push(finding);
    };

    const nodes = declareNodes(spec.nodes, push);
    const traversable = declareEdges(spec.edges, nodes, push);
    const adjacency = new Map<string, string[]>();

    for (const edge of traversable) {
        const targets = adjacency.get(edge.from);

        if (targets === undefined) {
            adjacency.set(edge.from, [edge.to]);

            continue;
        }

        targets.push(edge.to);
    }

    findCycles(nodes.keys(), adjacency, spec.key, push);

    return findings;
}
