import type { TASK_KIND_ENUM } from "../kind";
import type {
    AnySchema,
    TaskDefinitionBase,
    TaskMetadata,
    TaskSchemas,
    TrimTaskId,
} from "./base";
import type { DAGId } from "./dag-id";

/**
 * Input to the trigger factory after the id.
 */
export interface TriggerTaskInput<
    Input extends AnySchema = undefined,
    Output extends AnySchema = undefined,
>
    extends TaskMetadata, TaskSchemas<Input, Output> {
    /**
     * ID of the DAG to trigger; narrowed by `DAGIdRegistry`.
     */
    readonly dagId: DAGId;
    /**
     * Whether the trigger waits for the target DAG to finish; defaults to false.
     */
    readonly waitForCompletion?: boolean;
}

/**
 * A trigger task definition.
 */
export interface TriggerTaskDefinition<
    Id extends string = string,
    Input extends AnySchema = undefined,
    Output extends AnySchema = undefined,
> extends TaskDefinitionBase<Id, typeof TASK_KIND_ENUM.Trigger, Input, Output> {
    /**
     * ID of the DAG to trigger; narrowed by `DAGIdRegistry`.
     */
    readonly dagId: DAGId;
    /**
     * Whether the trigger waits for the target DAG to finish.
     */
    readonly waitForCompletion: boolean;
}

/**
 * Call signature of `trigger()`.
 */
export type CreateTrigger = <
    const Id extends string,
    Input extends AnySchema = undefined,
    Output extends AnySchema = undefined,
>(
    id: Id,
    input: TriggerTaskInput<Input, Output>
) => TriggerTaskDefinition<TrimTaskId<Id>, Input, Output>;
