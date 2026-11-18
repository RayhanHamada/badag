/**
 * Task types shared by every kind: schemas, context, callbacks, metadata, and
 * the base definition shape.
 */

import type { StandardSchemaV1 } from "@standard-schema/spec";

import type { TaskKind } from "../kind";
import type { TriggerRule } from "../trigger-rule";

/**
 * A Standard Schema accepted wherever a task declares its input or output.
 *
 * Valibot schemas satisfy this directly, so `v.object({...})` can be passed
 * without a wrapper.
 */
export type TaskSchema = StandardSchemaV1;

/** A schema, or `undefined` when a task declares none. */
export type AnySchema = TaskSchema | undefined;

/**
 * The schemas a task declares for the value it receives and the value it
 * produces.
 *
 * Both default to `undefined`, meaning the task declares no schema.
 */
export interface TaskSchemas<
    Input extends AnySchema = undefined,
    Output extends AnySchema = undefined,
> {
    /**
     * Schema for the value delivered in `ctx.payload`.
     */
    readonly input?: Input;
    /**
     * Schema for the value the task produces.
     */
    readonly output?: Output;
}

/**
 * The value a task receives in `ctx.payload` for an input schema.
 *
 * `undefined` when the task declares no input schema.
 */
export type TaskPayloadOf<Schema> = Schema extends StandardSchemaV1
    ? StandardSchemaV1.InferOutput<Schema>
    : undefined;

/**
 * The value a task produces for an output schema.
 *
 * `unknown` when the task declares no output schema.
 *
 * The schema is extracted rather than matched directly: a definition's
 * `output` is an optional property, so the argument is usually
 * `Schema | undefined`. Distributing over that union would pair the inferred
 * value with the `unknown` fallback and collapse to `unknown`.
 */
export type TaskProducedOf<Schema> = [
    Extract<Schema, StandardSchemaV1>,
] extends [never]
    ? unknown
    : StandardSchemaV1.InferOutput<Extract<Schema, StandardSchemaV1>>;

/**
 * A schema for a value that is only known at the type level.
 *
 * Kind-specific defaults use this to describe their produced value (a branch's
 * chosen names, a sensor's boolean) without requiring a runtime schema.
 */
export type SchemaOf<Value> = StandardSchemaV1<Value, Value>;

/**
 * A task callback with its name, payload, and result erased.
 *
 * `never` in both context positions is assignable to every concrete context, so
 * payload-carrying callbacks still flow into definition unions.
 */
export type AnyTaskFn = TaskFn<never, never, unknown>;

/**
 * Context passed as the first argument to every task callback.
 */
export interface TaskContext<
    TaskId extends string = string,
    Payload = undefined,
> {
    /**
     * ID of the task whose callback is running.
     */
    readonly id: TaskId;
    /**
     * Value supplied to the task; typed by the task's input schema.
     */
    readonly payload: Payload;
}

/**
 * A task callback.
 *
 * The task's context comes first; `id` narrows to the task's literal id when a
 * factory infers it, `Payload` comes from the input schema, and the result is
 * checked against the output schema.
 */
export type TaskFn<
    TaskId extends string = string,
    Payload = undefined,
    Result = unknown,
> = (ctx: TaskContext<TaskId, Payload>) => MaybePromise<Result>;

/** A value that may be returned synchronously or as a promise. */
export type MaybePromise<Value> = PromiseLike<Value> | Value;

/** Whitespace trimmed from a task id by the factories. */
type TaskIdWhitespace =
    | " "
    | "\n"
    | "\t"
    | "\r"
    | "\f"
    | "\v"
    | "\u00A0"
    | "\u1680"
    | "\u2000"
    | "\u2001"
    | "\u2002"
    | "\u2003"
    | "\u2004"
    | "\u2005"
    | "\u2006"
    | "\u2007"
    | "\u2008"
    | "\u2009"
    | "\u200A"
    | "\u2028"
    | "\u2029"
    | "\u202F"
    | "\u205F"
    | "\u3000"
    | "\uFEFF";

type TrimTaskIdEnd<Id extends string> =
    Id extends `${infer Rest}${TaskIdWhitespace}` ? TrimTaskIdEnd<Rest> : Id;

type TrimTaskIdStart<Id extends string> =
    Id extends `${TaskIdWhitespace}${infer Rest}` ? TrimTaskIdStart<Rest> : Id;

/** The task id after a factory trims surrounding whitespace. */
export type TrimTaskId<Id extends string> = TrimTaskIdStart<TrimTaskIdEnd<Id>>;

/**
 * Per-task execution settings stored on the task; the SDK never interprets them.
 */
export interface TaskConfig {
    /**
     * Optional timeout in milliseconds; stored but not enforced by the SDK.
     */
    timeout_ms?: number;
    /**
     * Additional application-specific settings, stored as-is.
     */
    [key: string]: unknown;
}

/**
 * Optional metadata shared by every task kind.
 */
export interface TaskMetadata {
    /**
     * Optional human-readable description.
     */
    readonly description?: string;
    /**
     * Optional per-task settings; stored but not interpreted by the SDK.
     */
    readonly config?: TaskConfig;
    /**
     * When the task becomes ready; defaults to "all_success".
     */
    readonly triggerRule?: TriggerRule;
}

/**
 * The shape shared by every task definition.
 */
export interface TaskDefinitionBase<
    Id extends string,
    Kind extends TaskKind,
    Input extends AnySchema = undefined,
    Output extends AnySchema = undefined,
>
    extends TaskMetadata, TaskSchemas<Input, Output> {
    /**
     * Discriminates the task kind.
     */
    readonly kind: Kind;
    /**
     * Unique id within the owning DAG.
     */
    readonly id: Id;
    /**
     * Normalized trigger rule; always present on a definition.
     */
    readonly triggerRule: TriggerRule;
}
