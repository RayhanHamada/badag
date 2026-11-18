import { taskMetadata } from "../definition/metadata";
import { taskSchemas } from "../definition/schemas";
import { normalizeTaskId } from "../definition/task-id";
import { TASK_KIND_ENUM } from "../kind";
import type { AnySchema, TrimTaskId } from "../types/base";
import type { TriggerTaskDefinition, TriggerTaskInput } from "../types/trigger";

/**
 * Build a trigger task definition.
 *
 * The stored callback returns the trigger request for a scheduler to execute:
 * the target DAG id and whether to wait for completion. The SDK does not start
 * the target DAG itself.
 */
export function trigger<
    const Id extends string,
    Input extends AnySchema = undefined,
    Output extends AnySchema = undefined,
>(
    id: Id,
    input: TriggerTaskInput<Input, Output>
): TriggerTaskDefinition<TrimTaskId<Id>, Input, Output> {
    if (!input.dagId.trim()) {
        throw new Error("Trigger DAG id cannot be empty");
    }

    const normalized = normalizeTaskId(id);
    const waitForCompletion = input.waitForCompletion ?? false;

    const definition = {
        kind: TASK_KIND_ENUM.Trigger,
        id: normalized,
        dagId: input.dagId,
        waitForCompletion,
        ...taskMetadata(input),
        ...taskSchemas(input),
    } satisfies TriggerTaskDefinition<TrimTaskId<Id>, Input, Output>;

    return definition;
}
