/**
 * Short-circuit tasks: types and the `shortCircuit()` factory.
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
    return definedFields({
        kind: TASK_KIND_ENUM.ShortCircuit,
        id: normalizeTaskId(id),
        condition: input.condition,
        ...taskMetadata(input),
        ...taskSchemas(input),
    });
}
