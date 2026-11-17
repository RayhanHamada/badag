import type { TASK_KIND_ENUM } from "../kind";
import type {
    AnySchema,
    AnyTaskFn,
    TaskDefinitionBase,
    TaskFn,
    TaskMetadata,
    TaskPayloadOf,
    TaskProducedOf,
    TaskSchemas,
    TrimTaskId,
} from "./base";

/**
 * Input to the regular task factory after the id.
 */
export interface TaskParamInput<
    Fn extends AnyTaskFn = AnyTaskFn,
    Input extends AnySchema = undefined,
    Output extends AnySchema = undefined,
>
    extends TaskMetadata, TaskSchemas<Input, Output> {
    /**
     * Task callback, invoked with a task context.
     */
    readonly fn: Fn;
}

/**
 * A regular task definition.
 */
export interface TaskParamOutput<
    Id extends string,
    Fn extends AnyTaskFn = TaskFn<Id>,
    Input extends AnySchema = undefined,
    Output extends AnySchema = undefined,
> extends TaskDefinitionBase<Id, typeof TASK_KIND_ENUM.Task, Input, Output> {
    /**
     * Task callback, invoked with a task context.
     */
    readonly fn: Fn;
}

/**
 * Call signature of `task()`.
 *
 * The id is trimmed; the returned definition has a normalized `triggerRule`.
 * `ctx.payload` is typed from `input`, and the callback result is checked
 * against `output`.
 */
export type CreateTask = <
    const Id extends string,
    Input extends AnySchema = undefined,
    Output extends AnySchema = undefined,
    Fn extends TaskFn<
        TrimTaskId<Id>,
        TaskPayloadOf<Input>,
        TaskProducedOf<Output>
    > = TaskFn<TrimTaskId<Id>, TaskPayloadOf<Input>, TaskProducedOf<Output>>,
>(
    id: Id,
    params: TaskParamInput<Fn, Input, Output>
) => TaskParamOutput<TrimTaskId<Id>, Fn, Input, Output>;
