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
 * `key` is the node's declared key. Nothing else is known: the SDK defines no
 * payload, so a runtime that supplies one owns its contract.
 */
export interface NodeContext<Key extends string = string> {
    readonly key: Key;
}

/**
 * The callable and output schema registered for a node key.
 *
 * `run` is a method so a narrower implementation stays assignable to the
 * erased registry type; `NodeContext` is the invocation contract, and the
 * schema records what the return value is.
 */
export interface Implementation<
    Key extends string = string,
    Output extends AnySchema = AnySchema,
> {
    // Bivariance keeps a narrower implementation assignable to the registry
    // type; a property signature would reject it under strictFunctionTypes.
    // oxlint-disable-next-line typescript/method-signature-style
    run(ctx: NodeContext<Key>): MaybePromise<NodeProducedOf<Output>>;
    /**
     * Schema for the value the node produces.
     */
    readonly output?: Output;
}

/** An implementation with its schema erased for registry storage. */
export type AnyImplementation = Implementation;
