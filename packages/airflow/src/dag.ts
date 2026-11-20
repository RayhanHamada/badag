/**
 * The Airflow authoring DAG: the graph builder plus `>>` / `<<` notation.
 *
 * Parsing is a dialect concern. It resolves labels, registers definitions, and
 * submits one transaction, so a rejected expression changes nothing.
 */

import { DAG } from "@badag/dag";
import type { AnyNodeDefinition } from "@badag/dag";
import { canonicalStringify } from "@badag/graph";
import type { GraphEdge } from "@badag/graph";

import { isLabeled, parseNotation } from "./notation";
import type { NotationOperand, WiringOperand } from "./notation";

const ROUTER_TYPES: ReadonlySet<string> = new Set(["branch", "short_circuit"]);

/** The node a wiring operand refers to, labeled or not. */
function definitionOf(operand: NotationOperand): AnyNodeDefinition {
    return isLabeled(operand) ? operand.definition : operand;
}

/**
 * A DAG with Airflow-style wiring notation.
 *
 * Everything else is inherited from `@badag/dag`; `parse` is the only dialect
 * addition to the builder.
 */
export class AirflowDAG<Key extends string = string> extends DAG<Key> {
    /**
     * Wire nodes with Airflow-style bitshift notation.
     *
     * dag.parse`${a} >> ${b} >> ${c}`          => a -> b -> c
     * dag.parse`${a} >> ${b} << ${c}`          => a -> b, c -> b
     * dag.parse`${route} >> ${[us, eu]}`       => labeled edges us and eu
     * dag.parse`${route} >> ${labeled("us", task)}`
     *
     * An edge out of a router defaults to the target's key as its label; every
     * other edge is unlabeled unless the target is labeled explicitly.
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
                if (isLabeled(source)) {
                    throw new Error(
                        `A route label applies to the target of an edge, not its source; remove the label from "${source.definition.key}"`
                    );
                }

                const router = ROUTER_TYPES.has(source.type);

                for (const target of step.to) {
                    const targetDefinition = definitionOf(target);

                    const graphEdge: GraphEdge = {
                        from: source.key,
                        to: targetDefinition.key,
                    };

                    let label: string | undefined;

                    if (isLabeled(target)) {
                        const { label: explicit } = target;

                        label = explicit;
                    } else if (router) {
                        label = targetDefinition.key;
                    }

                    edges.push(
                        label === undefined
                            ? graphEdge
                            : { ...graphEdge, label }
                    );
                }
            }
        }

        this.apply({
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
        operands: readonly NotationOperand[]
    ): readonly AnyNodeDefinition[] {
        const unique = new Map<string, AnyNodeDefinition>();

        for (const operand of operands) {
            const definition = definitionOf(operand);
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
