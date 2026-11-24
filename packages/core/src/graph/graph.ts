/**
 * The graph builder: one adjacency source, transactional mutations, and a
 * derived spec.
 *
 * Mutations plan the entire change, validate it, and only then write, so a
 * rejected batch leaves no node and no edge behind. Edges are identified by
 * `(from, to, label)`, which makes repeated wiring idempotent.
 */

import { checkSpec } from "./check";
import type { GraphFinding } from "./check";
import { orderSpec } from "./order";
import { canonicalStringify, revisionOf } from "./revision";
import { SPEC_VERSION, freezeConfig } from "./spec";
import type { GraphEdge, GraphNode, GraphNodeInput, GraphSpec } from "./spec";

/** One atomic mutation: nodes to add and edges to link. */
export interface GraphChange {
    readonly nodes?: readonly GraphNodeInput[];
    readonly edges?: readonly GraphEdge[];
}

function assertKey(key: string, label: string): void {
    if (key.trim() === "") {
        throw new Error(`${label} cannot be empty`);
    }
}

/** Edge identity: the same endpoints and label describe one edge. */
function edgeId(edge: GraphEdge): string {
    return JSON.stringify([edge.from, edge.to, edge.label ?? null]);
}

function sameNode(left: GraphNode, right: GraphNodeInput): boolean {
    return (
        left.type === right.type &&
        canonicalStringify(left.config) ===
            canonicalStringify(right.config ?? {})
    );
}

function freezeNode(entry: GraphNodeInput): GraphNode {
    return Object.freeze({
        key: entry.key,
        type: entry.type,
        config: freezeConfig(entry.config),
    });
}

function freezeEdge(edge: GraphEdge): GraphEdge {
    return edge.label === undefined
        ? Object.freeze({ from: edge.from, to: edge.to })
        : Object.freeze({ from: edge.from, to: edge.to, label: edge.label });
}

function append<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
    const set = map.get(key);

    if (set === undefined) {
        map.set(key, new Set([value]));

        return;
    }

    set.add(value);
}

/**
 * A directed acyclic graph of typed, configured nodes.
 *
 * The builder is mutable and every mutation is atomic. `spec()` derives the
 * serializable form, so there is never a second copy of the nodes or edges.
 */
export class Graph {
    readonly #key: string;
    readonly #nodes = new Map<string, GraphNode>();
    readonly #edges: GraphEdge[] = [];
    readonly #edgeIds = new Set<string>();
    readonly #downstream = new Map<string, Set<string>>();
    readonly #upstream = new Map<string, Set<string>>();

    constructor(key: string) {
        assertKey(key, "Graph key");
        this.#key = key;
    }

    /** The graph's declared key. */
    get key(): string {
        return this.#key;
    }

    /** Add nodes as one transaction. */
    addNodes(entries: readonly GraphNodeInput[]): void {
        this._apply({ nodes: entries });
    }

    /**
     * Link every node on the left to every node on the right.
     *
     * Wiring sets are complete bipartite: membership in one set implies no
     * edge between its members. Repeating an existing link is a no-op.
     */
    link(
        from: string | readonly string[],
        to: string | readonly string[],
        label?: string
    ): void {
        const froms = Array.isArray(from) ? from : [from];
        const tos = Array.isArray(to) ? to : [to];

        if (froms.length === 0 || tos.length === 0) {
            throw new Error("link requires at least one node on each side");
        }

        const edges: GraphEdge[] = [];

        for (const source of froms) {
            for (const target of tos) {
                edges.push(
                    label === undefined
                        ? { from: source, to: target }
                        : { from: source, to: target, label }
                );
            }
        }

        this._apply({ edges });
    }

    /**
     * Apply nodes and edges as one transaction.
     *
     * Internal: `addNodes`, `link`, and the DAG builder call it; consumers use
     * those methods instead.
     *
     * A node already present is reused when its type and config are unchanged
     * and rejected otherwise. An edge already present is skipped. Any
     * rejection leaves nothing from this call behind.
     */
    _apply(change: GraphChange): void {
        const plannedNodes = this.#planNodes(change.nodes ?? []);
        const plannedEdges = this.#planEdges(plannedNodes, change.edges ?? []);

        for (const [key, node] of plannedNodes) {
            this.#nodes.set(key, node);
        }

        for (const edge of plannedEdges) {
            this.#edges.push(edge);
            this.#edgeIds.add(edgeId(edge));
            append(this.#downstream, edge.from, edge.to);
            append(this.#upstream, edge.to, edge.from);
        }
    }

    /** Whether a node key is registered. */
    has(key: string): boolean {
        return this.#nodes.has(key);
    }

    /** Nodes in insertion order, keyed by their key. */
    nodes(): ReadonlyMap<string, GraphNode> {
        return new Map(this.#nodes);
    }

    /** Edges in insertion order. */
    edges(): readonly GraphEdge[] {
        return [...this.#edges];
    }

    /** Nodes that must finish before this node runs. */
    upstream(key: string): ReadonlySet<string> {
        return this.#neighbors(this.#upstream, key);
    }

    /** Nodes that run after this node completes. */
    downstream(key: string): ReadonlySet<string> {
        return this.#neighbors(this.#downstream, key);
    }

    /**
     * Return every node key in a valid execution order.
     *
     * Ties are broken by insertion order. Throws when the graph is cyclic,
     * which the mutations already prevent.
     */
    order(): readonly string[] {
        return orderSpec({
            key: this.#key,
            nodes: [...this.#nodes.values()],
            edges: this.#edges,
        });
    }

    /** Return every structural finding. Empty for a graph built here. */
    check(): readonly GraphFinding[] {
        return checkSpec({
            key: this.#key,
            nodes: [...this.#nodes.values()],
            edges: this.#edges,
        });
    }

    /**
     * Return the serializable spec.
     *
     * Nodes and edges keep insertion order; the revision hashes the canonical
     * form, so declaration order does not affect it.
     */
    spec(): GraphSpec {
        const nodes = [...this.#nodes.values()];
        const edges = [...this.#edges];

        return Object.freeze({
            specVersion: SPEC_VERSION,
            key: this.#key,
            revision: revisionOf(this.#key, nodes, edges),
            nodes: Object.freeze(nodes),
            edges: Object.freeze(edges),
        });
    }

    #neighbors(
        adjacency: ReadonlyMap<string, ReadonlySet<string>>,
        key: string
    ): ReadonlySet<string> {
        const neighbors = adjacency.get(key);

        if (neighbors !== undefined) {
            return new Set(neighbors);
        }

        if (!this.#nodes.has(key)) {
            throw new Error(
                `Node "${key}" is not registered in graph "${this.#key}"`
            );
        }

        return new Set();
    }

    /** Plan nodes: validate keys and reject conflicts before writing. */
    #planNodes(entries: readonly GraphNodeInput[]): Map<string, GraphNode> {
        const planned = new Map<string, GraphNode>();

        for (const entry of entries) {
            assertKey(entry.key, "Node key");

            if (entry.type.trim() === "") {
                throw new Error(`Node "${entry.key}" needs a non-empty type`);
            }

            const existing =
                this.#nodes.get(entry.key) ?? planned.get(entry.key);

            if (existing !== undefined) {
                if (!sameNode(existing, entry)) {
                    throw new Error(
                        `Node "${entry.key}" is already declared with a different type or config`
                    );
                }

                continue;
            }

            planned.set(entry.key, freezeNode(entry));
        }

        return planned;
    }

    /** Plan edges: resolve endpoints, skip duplicates, reject cycles. */
    #planEdges(
        plannedNodes: ReadonlyMap<string, GraphNode>,
        edges: readonly GraphEdge[]
    ): GraphEdge[] {
        const planned: GraphEdge[] = [];
        const plannedIds = new Set<string>();
        const overlay = new Map<string, Set<string>>();

        for (const edge of edges) {
            const known = (key: string): boolean =>
                this.#nodes.has(key) || plannedNodes.has(key);

            if (!known(edge.from)) {
                throw new Error(`Edge source "${edge.from}" is not registered`);
            }

            if (!known(edge.to)) {
                throw new Error(`Edge target "${edge.to}" is not registered`);
            }

            if (edge.from === edge.to) {
                throw new Error(`Node "${edge.from}" cannot depend on itself`);
            }

            if (edge.label !== undefined && edge.label.trim() === "") {
                throw new Error("Edge label cannot be empty");
            }

            const id = edgeId(edge);

            if (this.#edgeIds.has(id) || plannedIds.has(id)) {
                continue;
            }

            if (this.#reaches(edge.to, edge.from, overlay)) {
                throw new Error(
                    `Dependency "${edge.from}" -> "${edge.to}" creates a cycle`
                );
            }

            planned.push(freezeEdge(edge));
            plannedIds.add(id);
            append(overlay, edge.from, edge.to);
        }

        return planned;
    }

    /** Whether `target` is reachable from `start` through existing and planned edges. */
    #reaches(
        start: string,
        target: string,
        overlay: ReadonlyMap<string, ReadonlySet<string>>
    ): boolean {
        const visited = new Set<string>([start]);
        const queue = [start];

        // The queue grows while it is walked, so for...of would stop early.
        // oxlint-disable-next-line typescript/prefer-for-of
        for (let index = 0; index < queue.length; index += 1) {
            const current = queue[index];

            const sources = [
                this.#downstream.get(current),
                overlay.get(current),
            ];

            for (const source of sources) {
                if (source === undefined) {
                    continue;
                }

                for (const next of source) {
                    if (next === target) {
                        return true;
                    }

                    if (!visited.has(next)) {
                        visited.add(next);
                        queue.push(next);
                    }
                }
            }
        }

        return false;
    }
}

/** Create a graph without `new`. */
export const createGraph = (key: string): Graph => new Graph(key);
