import { taskMetadata } from "../definition/metadata";
import { taskSchemas } from "../definition/schemas";
import { normalizeTaskId } from "../definition/task-id";
import { TASK_KIND_ENUM } from "../kind";
import type { AnySchema, SchemaOf, TrimTaskId } from "../types/base";
import type {
    ShortCircuitTaskDefinition,
    ShortCircuitTaskInput,
} from "../types/short-circuit";

/**
 * Build a short-circuit task definition.
 *
 * `condition` is stored on the definition and invoked by the task callback
 * with the task context. The returned boolean tells the scheduler whether
 * downstream tasks should run; the SDK itself does not prune edges.
 */
export function shortCircuit<
    const Id extends string,
    Input extends AnySchema = undefined,
    Output extends AnySchema = SchemaOf<boolean>,
>(
    id: Id,
    input: ShortCircuitTaskInput<TrimTaskId<Id>, Input, Output>
): ShortCircuitTaskDefinition<TrimTaskId<Id>, Input, Output> {
    const normalized = normalizeTaskId(id);

    const definition = {
        kind: TASK_KIND_ENUM.ShortCircuit,
        id: normalized,
        condition: input.condition,
        ...taskMetadata(input),
        ...taskSchemas(input),
    } satisfies ShortCircuitTaskDefinition<TrimTaskId<Id>, Input, Output>;

    return definition;
}
