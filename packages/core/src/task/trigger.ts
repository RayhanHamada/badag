/**
 * Trigger tasks: types, the registry of known DAG ids, and `trigger()`.
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
 * DAG ids known to trigger tasks.
 *
 * Empty by default, which leaves `dagId` a plain `string`. Augment the
 * interface to narrow `dagId` to the DAG ids your project declares:
 *
 * ```ts
 * declare module "@badag/core" {
 *     interface DAGIdRegistry {
 *         nightly: true;
 *     }
 * }
 * ```
 *
 * Each key is a DAG id; the values are never read. The interface starts empty
 * on purpose, so the empty-interface lint rules are disabled below.
 */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type
export interface DAGIdRegistry {}

/**
 * A DAG id accepted by a trigger task.
 *
 * Widens to `string` while `DAGIdRegistry` has no keys, then narrows to the
 * registered ids.
 */
export type DAGId = [keyof DAGIdRegistry] extends [never]
    ? string
    : Extract<keyof DAGIdRegistry, string>;

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

/**
 * Build a trigger task definition.
 *
 * The definition stores the trigger request for a scheduler to execute: the
 * target DAG id and whether to wait for completion. The SDK does not start the
 * target DAG itself.
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

    return definedFields({
        kind: TASK_KIND_ENUM.Trigger,
        id: normalizeTaskId(id),
        dagId: input.dagId,
        waitForCompletion: input.waitForCompletion ?? false,
        ...taskMetadata(input),
        ...taskSchemas(input),
    });
}
