import { taskMetadata } from "../definition/metadata";
import { taskSchemas } from "../definition/schemas";
import { normalizeTaskId } from "../definition/task-id";
import { TASK_KIND_ENUM } from "../kind";
import type { AnySchema, AnyTaskFn } from "../types/base";
import type { CreateTask, TaskParamOutput } from "../types/task";

/**
 * Build a regular task definition outside any DAG.
 *
 * Ids are trimmed and validated here, so the definition carries its final id.
 */
export const task: CreateTask = (id, params) => {
    const definition = {
        kind: TASK_KIND_ENUM.Task,
        id: normalizeTaskId(id),
        fn: params.fn,
        ...taskMetadata(params),
        ...taskSchemas(params),
    } satisfies TaskParamOutput<string, AnyTaskFn, AnySchema, AnySchema>;

    return definition;
};
