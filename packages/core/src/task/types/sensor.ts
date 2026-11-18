import type { TASK_KIND_ENUM } from "../kind";
import type {
    AnySchema,
    MaybePromise,
    SchemaOf,
    TaskContext,
    TaskDefinitionBase,
    TaskMetadata,
    TaskPayloadOf,
    TaskSchemas,
    TrimTaskId,
} from "./base";

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
