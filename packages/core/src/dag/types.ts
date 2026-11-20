/**
 * Types shared by the task layer: schemas, the implementation registry's
 * callable, and the context a node receives.
 *
 * The graph layer knows a node only by key, type, and config. Everything the
 * node does lives here, behind a key, so the spec stays serializable.
 */

import type { StandardSchemaV1 } from "@standard-schema/spec";

/** A Standard Schema, or `undefined` when the node declares none. */
export type AnySchema = StandardSchemaV1 | undefined;

/** A value that may be returned synchronously or as a promise. */
export type MaybePromise<Value> = PromiseLike<Value> | Value;

/** The value delivered in `ctx.payload` for an input schema. */
export type NodePayloadOf<Schema> = Schema extends StandardSchemaV1
    ? StandardSchemaV1.InferOutput<Schema>
    : undefined;

/**
 * The value a node produces for an output schema.
 *
 * `unknown` when none is declared. The extraction keeps the optional-property
 * union from collapsing the inferred value into `unknown`.
 */
export type NodeProducedOf<Schema> = [
    Extract<Schema, StandardSchemaV1>,
] extends [never]
    ? unknown
    : StandardSchemaV1.InferOutput<Extract<Schema, StandardSchemaV1>>;

/**
 * Context passed to a node implementation.
 *
 * `key` is the node's declared key; `payload` is typed by its input schema.
 */
export interface NodeContext<Key extends string = string, Payload = unknown> {
    readonly key: Key;
    readonly payload: Payload;
}

/**
 * The callable and schemas registered for a node key.
 *
 * `run` is a method so a narrower implementation stays assignable to the
 * erased registry type; `NodeContext` is the payload contract, and the schemas
 * record what that contract is.
 */
export interface Implementation<
    Key extends string = string,
    Input extends AnySchema = AnySchema,
    Output extends AnySchema = AnySchema,
> {
    // Bivariance keeps a narrower implementation assignable to the registry
    // type; a property signature would reject it under strictFunctionTypes.
    // oxlint-disable-next-line typescript/method-signature-style
    run(
        ctx: NodeContext<Key, NodePayloadOf<Input>>
    ): MaybePromise<NodeProducedOf<Output>>;
    /**
     * Schema for the value delivered in `ctx.payload`.
     */
    readonly input?: Input;
    /**
     * Schema for the value the node produces.
     */
    readonly output?: Output;
}

/** An implementation with its schemas erased for registry storage. */
export type AnyImplementation = Implementation;
