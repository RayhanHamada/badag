import { assertPositiveDuration } from "../definition/duration";
import { taskMetadata } from "../definition/metadata";
import { taskSchemas } from "../definition/schemas";
import { normalizeTaskId } from "../definition/task-id";
import { TASK_KIND_ENUM } from "../kind";
import type { AnySchema, SchemaOf, TrimTaskId } from "../types/base";
import type { SensorTaskDefinition, SensorTaskInput } from "../types/sensor";

/**
 * Build a sensor task definition.
 *
 * The definition stores the predicate and an optional polling interval. The
 * SDK does not poll or wait; a scheduler decides when to evaluate the
 * predicate.
 */
export function sensor<
    const Id extends string,
    Input extends AnySchema = undefined,
    Output extends AnySchema = SchemaOf<boolean>,
>(
    id: Id,
    input: SensorTaskInput<TrimTaskId<Id>, Input, Output>
): SensorTaskDefinition<TrimTaskId<Id>, Input, Output> {
    const normalized = normalizeTaskId(id);
    const { pokeIntervalMs } = input;

    if (pokeIntervalMs !== undefined) {
        assertPositiveDuration("pokeIntervalMs", pokeIntervalMs);
    }

    const definition = {
        kind: TASK_KIND_ENUM.Sensor,
        id: normalized,
        predicate: input.predicate,
        ...taskMetadata(input),
        ...taskSchemas(input),
    } satisfies SensorTaskDefinition<TrimTaskId<Id>, Input, Output>;

    return pokeIntervalMs === undefined
        ? definition
        : { ...definition, pokeIntervalMs };
}
