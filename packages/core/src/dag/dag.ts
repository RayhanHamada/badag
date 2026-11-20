/**
 * The DAG builder: a graph plus an implementation registry keyed by node key.
 *
 * Declarations and code travel together while authoring and separate at
 * `build()`. Every mutation is atomic across both channels: a rejected graph
 * change registers no implementation, and a duplicate key registers neither.
 */

import { createGraph } from "../graph";
import type { Graph, GraphEdge, GraphNode, GraphSpec } from "../graph";
import type { AnyNodeDefinition } from "./definition";
import type { AnyImplementation } from "./types";

/** One atomic mutation: definitions to register and edges to link. */
export interface DAGChange {
    readonly nodes?: readonly AnyNodeDefinition[];
    readonly edges?: readonly GraphEdge[];
}

/** A built DAG: the serializable spec and the code keyed by node key. */
export interface BuiltDAG {
    readonly spec: GraphSpec;
    readonly implementations: ReadonlyMap<string, AnyImplementation>;
}

/**
 * A DAG under construction.
 *
 * The builder is mutable and fluent; `build()` returns the immutable split.
 * The node key is the only join between the spec and the implementations.
 */
export class DAG<Key extends string = string> {
    readonly #key: Key;
    readonly #graph: Graph;
    readonly #implementations = new Map<string, AnyImplementation>();

    constructor(key: Key) {
        this.#key = key;
        this.#graph = createGraph(key);
    }

    /** The DAG's declared key. */
    get key(): Key {
        return this.#key;
    }

    /** Register one definition. */
    add(definition: AnyNodeDefinition): this {
        return this.apply({ nodes: [definition] });
    }

    /** Register several definitions as one transaction. */
    addAll(definitions: readonly AnyNodeDefinition[]): this {
        return this.apply({ nodes: definitions });
    }

    /**
     * Link every node on the left to every node on the right.
     *
     * Every endpoint must already be registered; wiring is complete bipartite
     * and repeating an existing link is a no-op.
     */
    link(
        from: string | readonly string[],
        to: string | readonly string[],
        label?: string
    ): this {
        this.#graph.link(from, to, label);

        return this;
    }

    /**
     * Register definitions and edges as one transaction.
     *
     * A duplicate node key throws before anything is written, in this DAG or
     * in the same batch. A graph-level rejection leaves the registry untouched.
     */
    apply(change: DAGChange): this {
        const definitions = change.nodes ?? [];
        const batch = new Set<string>();

        for (const definition of definitions) {
            if (this.#graph.has(definition.key) || batch.has(definition.key)) {
                throw new Error(
                    `Node "${definition.key}" is already declared in DAG "${this.#key}"`
                );
            }

            batch.add(definition.key);
        }

        this.#graph.apply({
            nodes: definitions.map((definition) => ({
                key: definition.key,
                type: definition.type,
                config: definition.config,
            })),
            edges: change.edges,
        });

        for (const definition of definitions) {
            if (definition.implementation !== undefined) {
                this.#implementations.set(
                    definition.key,
                    definition.implementation
                );
            }
        }

        return this;
    }

    /**
     * Return the implementation for a node key.
     *
     * A declaration without an implementation is legal, so an unknown key is
     * `undefined` rather than an error.
     */
    resolve(key: string): AnyImplementation | undefined {
        return this.#implementations.get(key);
    }

    /** Whether a node key is registered. */
    has(key: string): boolean {
        return this.#graph.has(key);
    }

    /** Registered nodes in insertion order, keyed by node key. */
    nodes(): ReadonlyMap<string, GraphNode> {
        return this.#graph.nodes();
    }

    /** The serializable spec. */
    spec(): GraphSpec {
        return this.#graph.spec();
    }

    /**
     * Split the DAG into its spec and implementations.
     *
     * The spec is frozen and contains no functions; the implementation map is
     * a copy, so later builder changes cannot alter a built artifact.
     */
    build(): BuiltDAG {
        return Object.freeze({
            spec: this.#graph.spec(),
            implementations: new Map(this.#implementations),
        });
    }
}

/** Create a DAG without `new`, keeping the literal key in the type. */
export const createDAG = <const Key extends string>(key: Key): DAG<Key> =>
    new DAG(key);
