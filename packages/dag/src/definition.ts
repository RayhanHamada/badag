/**
 * Node declarations: the authoring form that carries both channels.
 *
 * A definition bundles the spec data (key, type, config) with the code that
 * executes it. `DAG.build()` splits the two, so definitions never leak into a
 * serialized spec.
 */

import type { JsonObject } from "@badag/graph";
import { freezeConfig } from "@badag/graph";

import type {
    AnySchema,
    Implementation,
    MaybePromise,
    NodeContext,
    NodePayloadOf,
    NodeProducedOf,
} from "./types";

/** Input to `defineNode`. */
export interface NodeDefinitionInput<
    Key extends string = string,
    Type extends string = string,
    Input extends AnySchema = AnySchema,
    Output extends AnySchema = AnySchema,
> {
    /**
     * Declared identifier, unique within the DAG.
     */
    readonly key: Key;
    /**
     * Open discriminator; the dialect and runtime decide what it means.
     */
    readonly type: Type;
    /**
     * Open JSON config; the graph layer never interprets it.
     */
    readonly config?: JsonObject;
    /**
     * Schema for the value delivered in `ctx.payload`.
     */
    readonly input?: Input;
    /**
     * Schema for the value the node produces.
     */
    readonly output?: Output;
    /**
     * The work the node performs. Omit it to declare a node whose
     * implementation is supplied later or by the runtime.
     */
    readonly run?: (
        ctx: NodeContext<Key, NodePayloadOf<Input>>
    ) => MaybePromise<NodeProducedOf<Output>>;
}

/** A node declaration with its key, type, config, and implementation. */
export interface NodeDefinition<
    Key extends string = string,
    Type extends string = string,
    Input extends AnySchema = AnySchema,
    Output extends AnySchema = AnySchema,
> {
    readonly key: Key;
    readonly type: Type;
    readonly config: JsonObject;
    /**
     * `undefined` when the node was declared without code.
     */
    readonly implementation?: Implementation<Key, Input, Output>;
}

/** A node definition with its literals erased for registration. */
export type AnyNodeDefinition = NodeDefinition<
    string,
    string,
    AnySchema,
    AnySchema
>;

/**
 * Build a node definition.
 *
 * The key and type are validated here; the definition is frozen, so the same
 * object can be registered in several DAGs without sharing mutable state.
 */
export function defineNode<
    const Key extends string,
    const Type extends string,
    Input extends AnySchema = undefined,
    Output extends AnySchema = undefined,
>(
    input: NodeDefinitionInput<Key, Type, Input, Output>
): NodeDefinition<Key, Type, Input, Output> {
    if (input.key.trim() === "") {
        throw new Error("Node key cannot be empty");
    }

    if (input.type.trim() === "") {
        throw new Error(`Node "${input.key}" needs a non-empty type`);
    }

    return Object.freeze({
        key: input.key,
        type: input.type,
        config: freezeConfig(input.config),
        implementation:
            input.run === undefined
                ? undefined
                : Object.freeze({
                      run: input.run,
                      input: input.input,
                      output: input.output,
                  }),
    });
}
