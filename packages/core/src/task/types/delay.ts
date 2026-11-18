import type { TASK_KIND_ENUM } from "../kind";
import type {
    AnySchema,
    TaskDefinitionBase,
    TaskMetadata,
    TaskSchemas,
    TrimTaskId,
} from "./base";

/**
 * Input to the delay factory after the id.
 */
export interface DelayTaskInput<
    Input extends AnySchema = undefined,
    Output extends AnySchema = undefined,
>
    extends TaskMetadata, TaskSchemas<Input, Output> {
    /**
     * Delay duration in milliseconds.
     */
    readonly durationMs: number;
}

/**
 * A delay task definition.
 *
 * A delay declares no schemas by default; it produces no value of its own.
 */
export interface DelayTaskDefinition<
    Id extends string = string,
    Input extends AnySchema = undefined,
    Output extends AnySchema = undefined,
> extends TaskDefinitionBase<Id, typeof TASK_KIND_ENUM.Delay, Input, Output> {
    /**
     * Delay duration in milliseconds.
     */
    readonly durationMs: number;
}

/**
 * Call signature of `delay()`.
 */
export type CreateDelay = <
    const Id extends string,
    Input extends AnySchema = undefined,
    Output extends AnySchema = undefined,
>(
    id: Id,
    input: DelayTaskInput<Input, Output>
) => DelayTaskDefinition<TrimTaskId<Id>, Input, Output>;
