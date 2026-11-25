/**
 * Node declarations: the authoring form that carries both channels.
 *
 * A definition bundles the spec data (key, type, config) with the code that
 * executes it. `DAG.build()` splits the two, so definitions never leak into a
 * serialized spec.
 */

import type { JsonObject } from "../graph";
import { freezeConfig } from "../graph";
import { nodeHashOf } from "./hash";
import type {
    AnySchema,
    Implementation,
    MaybePromise,
    NodeContext,
    NodeProducedOf,
} from "./types";

/** Input to `defineNode`. */
export interface NodeDefinitionInput<
    Key extends string = string,
    Type extends string = string,
    Output extends AnySchema = AnySchema,
    Config extends JsonObject = JsonObject,
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
    readonly config?: Config;
    /**
     * Schema for the value the node produces.
     */
    readonly output?: Output;
    /**
     * The work the node performs. Omit it to declare a node whose
     * implementation is supplied later or by the runtime.
     */
    readonly run?: (
        ctx: NodeContext<Key>
    ) => MaybePromise<NodeProducedOf<Output>>;
    /**
     * Source text used for the content hash instead of `run.toString()`.
     *
     * Presets use it when the registered callback is a generated wrapper and
     * the behavior that determines the node lives in an option.
     */
    readonly hashSource?: string;
}

/** A node declaration with its key, type, config, and implementation. */
export interface NodeDefinition<
    Key extends string = string,
    Type extends string = string,
    Output extends AnySchema = AnySchema,
    Config extends JsonObject = JsonObject,
> {
    readonly key: Key;
    readonly type: Type;
    readonly config: Config;
    /**
     * Content hash of the type, config (minus `description`), and behavior
     * source. The key and description are excluded.
     *
     * Lazily computed on first call and cached; the promise owns the digest,
     * so repeated calls do not rehash.
     */
    readonly hash: () => Promise<string>;
    /**
     * `undefined` when the node was declared without code.
     */
    readonly implementation?: Implementation<Key, Output>;
}

/** A node definition with its literals erased for registration. */
export type AnyNodeDefinition = NodeDefinition<string, string, AnySchema>;

/**
 * Build a node definition.
 *
 * The key and type are validated here; the definition is frozen, so the same
 * object can be registered in several DAGs without sharing mutable state.
 */
export function defineNode<
    const Key extends string,
    const Type extends string,
    Output extends AnySchema = undefined,
    Config extends JsonObject = JsonObject,
>(
    input: NodeDefinitionInput<Key, Type, Output, Config>
): NodeDefinition<Key, Type, Output, Config> {
    if (input.key.trim() === "") {
        throw new Error("Node key cannot be empty");
    }

    if (input.type.trim() === "") {
        throw new Error(`Node "${input.key}" needs a non-empty type`);
    }

    const { key, type } = input;
    const config = freezeConfig(input.config);

    const source =
        input.hashSource ??
        (input.run === undefined ? undefined : input.run.toString());

    let hash: Promise<string> | undefined;

    return Object.freeze({
        key,
        type,
        config,
        hash: () => {
            hash ??= nodeHashOf(type, config, source);

            return hash;
        },
        implementation:
            input.run === undefined
                ? undefined
                : Object.freeze({
                      run: input.run,
                      output: input.output,
                  }),
    });
}
