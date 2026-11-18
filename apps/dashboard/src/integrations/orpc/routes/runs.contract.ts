import * as v from "valibot";

import { base } from "../base";
import { NOT_FOUND_ERROR_MAP, NOT_IMPLEMENTED_ERROR_MAP } from "../errors";
import {
    dagRunListSchema,
    dagRunSchema,
    runIdParamsSchema,
    runListQuerySchema,
    taskExecutionListQuerySchema,
    taskExecutionListSchema,
    taskExecutionParamsSchema,
    taskExecutionSchema,
} from "../models";

export const runsContract = {
    list: base
        .route({
            method: "GET",
            path: "/runs",
            tags: ["Runs"],
            summary: "List DAG runs",
            description:
                "Returns runs across every DAG. Filter by DAG, status, or trigger type.",
            successDescription: "DAG run list.",
        })
        .input(runListQuerySchema)
        .output(dagRunListSchema)
        .errors(NOT_IMPLEMENTED_ERROR_MAP),

    get: base
        .route({
            method: "GET",
            path: "/runs/{runId}",
            tags: ["Runs"],
            summary: "Get a DAG run",
            description:
                "Returns one run, including its status, trigger, input, and output.",
            successDescription: "DAG run.",
        })
        .input(runIdParamsSchema)
        .output(dagRunSchema)
        .errors({ ...NOT_IMPLEMENTED_ERROR_MAP, ...NOT_FOUND_ERROR_MAP }),

    listTaskExecutions: base
        .route({
            method: "GET",
            path: "/runs/{runId}/tasks",
            tags: ["Runs"],
            summary: "List task executions",
            description:
                "Returns the per-task executions belonging to one DAG run.",
            successDescription: "Task execution list.",
        })
        .input(
            v.object({
                ...runIdParamsSchema.entries,
                ...taskExecutionListQuerySchema.entries,
            })
        )
        .output(taskExecutionListSchema)
        .errors({ ...NOT_IMPLEMENTED_ERROR_MAP, ...NOT_FOUND_ERROR_MAP }),

    getTaskExecution: base
        .route({
            method: "GET",
            path: "/runs/{runId}/tasks/{taskExecutionId}",
            tags: ["Runs"],
            summary: "Get a task execution",
            description:
                "Returns one task execution, including its attempt, timestamps, and error if it failed.",
            successDescription: "Task execution.",
        })
        .input(taskExecutionParamsSchema)
        .output(taskExecutionSchema)
        .errors({ ...NOT_IMPLEMENTED_ERROR_MAP, ...NOT_FOUND_ERROR_MAP }),

    cancel: base
        .route({
            method: "POST",
            path: "/runs/{runId}/cancel",
            tags: ["Runs"],
            summary: "Cancel a DAG run",
            description:
                "Requests cancellation of a running DAG run. Returns the run with its updated status.",
            successStatus: 202,
            successDescription: "Cancellation accepted.",
        })
        .input(runIdParamsSchema)
        .output(dagRunSchema)
        .errors({ ...NOT_IMPLEMENTED_ERROR_MAP, ...NOT_FOUND_ERROR_MAP }),
};
