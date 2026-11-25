/**
 * The Airflow authoring DAG: the graph builder plus `>>` / `<<` notation.
 *
 * Parsing is a dialect concern. It resolves labels, registers definitions, and
 * submits one transaction, so a rejected expression changes nothing.
 */

import { canonicalStringify, DAG } from "@badag/core";
import type { AnyNodeDefinition, GraphEdge } from "@badag/core";

import { parseNotation } from "./notation";
import type { WiringOperand } from "./notation";

const ROUTER_TYPES: ReadonlySet<string> = new Set(["branch", "short_circuit"]);

/**
 * A DAG with Airflow-style wiring notation.
 *
 * Everything else is inherited from `@badag/core`; `parse` is the only dialect
 * addition to the builder.
 */
export class AirflowDAG<Key extends string = string> extends DAG<Key> {
    /**
     * Wire nodes with Airflow-style bitshift notation.
     *
     * dag.parse`${a} >> ${b} >> ${c}`          => a -> b -> c
     * dag.parse`${a} >> ${b} << ${c}`          => a -> b, c -> b
     * dag.parse`${route} >> ${[us, eu]}`       => labeled edges us and eu
     *
     * An edge out of a router carries the target's key as its label; every
     * other edge is unlabeled. A route label is therefore always a node key.
     *
     * The call is transactional: a rejected operand, label, edge, or duplicate
     * leaves the DAG unchanged. A definition already registered is reused only
     * when its type, config, and implementation match; the same expression may
     * therefore be repeated across statements.
     */
    parse(
        segments: TemplateStringsArray,
        ...operands: readonly WiringOperand[]
    ): this {
        const parsed = parseNotation(this.key, segments, operands);
        const edges: GraphEdge[] = [];

        for (const step of parsed.steps) {
            for (const source of step.from) {
                const router = ROUTER_TYPES.has(source.type);

                for (const target of step.to) {
                    const graphEdge: GraphEdge = {
                        from: source.key,
                        to: target.key,
                    };

                    edges.push(
                        router ? { ...graphEdge, label: target.key } : graphEdge
                    );
                }
            }
        }

        this._apply({
            nodes: this.#freshDefinitions(parsed.operands),
            edges,
        });

        return this;
    }

    /**
     * Return the definitions this expression actually adds.
     *
     * A key already registered is accepted only when the same definition is
     * supplied again; anything else throws the duplicate error.
     */
    #freshDefinitions(
        operands: readonly AnyNodeDefinition[]
    ): readonly AnyNodeDefinition[] {
        const unique = new Map<string, AnyNodeDefinition>();

        for (const definition of operands) {
            const previous = unique.get(definition.key);

            if (previous !== undefined && previous !== definition) {
                throw new Error(
                    `Node "${definition.key}" is used with two different definitions in one expression`
                );
            }

            unique.set(definition.key, definition);
        }

        const fresh: AnyNodeDefinition[] = [];

        for (const definition of unique.values()) {
            if (!this.has(definition.key)) {
                fresh.push(definition);

                continue;
            }

            const node = this.nodes().get(definition.key);

            const same =
                node?.type === definition.type &&
                this.resolve(definition.key) === definition.implementation &&
                canonicalStringify(node.config) ===
                    canonicalStringify(definition.config);

            if (!same) {
                throw new Error(
                    `Node "${definition.key}" is already declared in DAG "${this.key}" with a different definition`
                );
            }
        }

        return fresh;
    }
}

/** Create an Airflow DAG without `new`, keeping the literal key in the type. */
export const createDAG = <const Key extends string>(
    key: Key
): AirflowDAG<Key> => new AirflowDAG(key);
