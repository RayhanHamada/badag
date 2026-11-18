import { assertNonNegativeDuration } from "../definition/duration";
import { taskMetadata } from "../definition/metadata";
import { taskSchemas } from "../definition/schemas";
import { normalizeTaskId } from "../definition/task-id";
import { TASK_KIND_ENUM } from "../kind";
import type { AnySchema, TrimTaskId } from "../types/base";
import type { DelayTaskDefinition, DelayTaskInput } from "../types/delay";

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
    assertNonNegativeDuration("durationMs", input.durationMs);

    const definition = {
        kind: TASK_KIND_ENUM.Delay,
        id: normalizeTaskId(id),
        durationMs: input.durationMs,
        ...taskMetadata(input),
        ...taskSchemas(input),
    } satisfies DelayTaskDefinition<TrimTaskId<Id>, Input, Output>;

    return definition;
}
