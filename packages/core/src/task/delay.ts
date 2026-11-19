/**
 * Delay tasks: types and the `delay()` factory.
 */

import { definedFields } from "../fields";
import type {
    AnySchema,
    TaskDefinitionBase,
    TaskMetadata,
    TaskSchemas,
} from "./base";
import { taskMetadata, taskSchemas } from "./definition";
import { normalizeTaskId } from "./id";
import type { TrimTaskId } from "./id";
import { TASK_KIND_ENUM } from "./kind";

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

/**
 * Build a delay task definition.
 *
 * The definition stores its duration. The SDK does not wait; a scheduler is
 * responsible for honoring `durationMs`.
 */
export function delay<
    const Id extends string,
    Input extends AnySchema = undefined,
    Output extends AnySchema = undefined,
>(
    id: Id,
    input: DelayTaskInput<Input, Output>
): DelayTaskDefinition<TrimTaskId<Id>, Input, Output> {
    if (!Number.isFinite(input.durationMs)) {
        throw new TypeError("durationMs must be a finite number");
    }

    if (input.durationMs < 0) {
        throw new Error("durationMs must be greater than or equal to 0");
    }

    return definedFields({
        kind: TASK_KIND_ENUM.Delay,
        id: normalizeTaskId(id),
        durationMs: input.durationMs,
        ...taskMetadata(input),
        ...taskSchemas(input),
    });
}
