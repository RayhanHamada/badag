/**
 * Sensor tasks: types and the `sensor()` factory.
 */

import { definedFields } from "../fields";
import type {
    AnySchema,
    MaybePromise,
    SchemaOf,
    TaskContext,
    TaskDefinitionBase,
    TaskMetadata,
    TaskPayloadOf,
    TaskSchemas,
} from "./base";
import { taskMetadata, taskSchemas } from "./definition";
import { normalizeTaskId } from "./id";
import type { TrimTaskId } from "./id";
import { TASK_KIND_ENUM } from "./kind";

/**
 * Predicate polled by a sensor until it returns true.
 */
export type SensorPredicate<Id extends string = string, Payload = undefined> = (
    ctx: TaskContext<Id, Payload>
) => MaybePromise<boolean>;

/**
 * Input to the sensor factory after the id.
 */
export interface SensorTaskInput<
    Id extends string = string,
    Input extends AnySchema = undefined,
    Output extends AnySchema = undefined,
>
    extends TaskMetadata, TaskSchemas<Input, Output> {
    /**
     * Predicate evaluated by the sensor.
     */
    readonly predicate: SensorPredicate<Id, TaskPayloadOf<Input>>;
    /**
     * Delay between predicate evaluations in milliseconds.
     */
    readonly pokeIntervalMs?: number;
}

/**
 * A sensor task definition.
 *
 * A sensor produces a boolean when no output schema is declared, since its
 * result is whether the predicate became true.
 */
export interface SensorTaskDefinition<
    Id extends string = string,
    Input extends AnySchema = undefined,
    Output extends AnySchema = SchemaOf<boolean>,
> extends TaskDefinitionBase<Id, typeof TASK_KIND_ENUM.Sensor, Input, Output> {
    /**
     * Predicate evaluated by the sensor.
     */
    readonly predicate: SensorPredicate<Id, TaskPayloadOf<Input>>;
    /**
     * Delay between predicate evaluations in milliseconds.
     */
    readonly pokeIntervalMs?: number;
}

/**
 * Call signature of `sensor()`.
 */
export type CreateSensor = <
    const Id extends string,
    Input extends AnySchema = undefined,
    Output extends AnySchema = SchemaOf<boolean>,
>(
    id: Id,
    input: SensorTaskInput<TrimTaskId<Id>, Input, Output>
) => SensorTaskDefinition<TrimTaskId<Id>, Input, Output>;

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
        if (!Number.isFinite(pokeIntervalMs)) {
            throw new TypeError("pokeIntervalMs must be a finite number");
        }

        if (pokeIntervalMs <= 0) {
            throw new Error("pokeIntervalMs must be greater than 0");
        }
    }

    return definedFields({
        kind: TASK_KIND_ENUM.Sensor,
        id: normalized,
        predicate: input.predicate,
        pokeIntervalMs,
        ...taskMetadata(input),
        ...taskSchemas(input),
    });
}
