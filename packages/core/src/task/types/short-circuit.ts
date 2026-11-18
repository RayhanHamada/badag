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
 * Condition evaluated by a short-circuit task.
 */
export type ShortCircuitCondition<
    Id extends string = string,
    Payload = undefined,
> = (ctx: TaskContext<Id, Payload>) => MaybePromise<boolean>;

/**
 * Input to the short-circuit factory after the id.
 */
export interface ShortCircuitTaskInput<
    Id extends string = string,
    Input extends AnySchema = undefined,
    Output extends AnySchema = undefined,
>
    extends TaskMetadata, TaskSchemas<Input, Output> {
    /**
     * Condition that controls whether downstream tasks run.
     */
    readonly condition: ShortCircuitCondition<Id, TaskPayloadOf<Input>>;
}

/**
 * A short-circuit task definition.
 *
 * A short-circuit produces a boolean when no output schema is declared, since
 * its result is whether downstream tasks should run.
 */
export interface ShortCircuitTaskDefinition<
    Id extends string = string,
    Input extends AnySchema = undefined,
    Output extends AnySchema = SchemaOf<boolean>,
> extends TaskDefinitionBase<
    Id,
    typeof TASK_KIND_ENUM.ShortCircuit,
    Input,
    Output
> {
    /**
     * Condition that controls whether downstream tasks run.
     */
    readonly condition: ShortCircuitCondition<Id, TaskPayloadOf<Input>>;
}

/**
 * Call signature of `shortCircuit()`.
 */
export type CreateShortCircuit = <
    const Id extends string,
    Input extends AnySchema = undefined,
    Output extends AnySchema = SchemaOf<boolean>,
>(
    id: Id,
    input: ShortCircuitTaskInput<TrimTaskId<Id>, Input, Output>
) => ShortCircuitTaskDefinition<TrimTaskId<Id>, Input, Output>;
