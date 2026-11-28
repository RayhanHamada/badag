import * as v from "valibot";

import { base } from "../base";
import { NOT_FOUND_ERROR_MAP, NOT_IMPLEMENTED_ERROR_MAP } from "../errors";
import {
    createDagBodySchema,
    createDagEdgeBodySchema,
    createDagTasksBodySchema,
    dagDetailSchema,
    dagEdgeListSchema,
    dagEdgeSchema,
    dagIdParamsSchema,
    dagListQuerySchema,
    dagListSchema,
    dagRunListSchema,
    dagRunSchema,
    dagScopedRunListQuerySchema,
    dagSchema,
    dagTaskListSchema,
    triggerDagRunBodySchema,
    updateDagBodySchema,
} from "../models";

export const dagsContract = {
    list: base
        .route({
            method: "GET",
            path: "/dags",
            tags: ["DAGs"],
            summary: "List DAGs",
            description:
                "Returns a paginated list of DAGs. Use `search` to filter by name.",
            successDescription: "Paginated DAG list.",
        })
        .input(dagListQuerySchema)
        .output(dagListSchema)
        .errors(NOT_IMPLEMENTED_ERROR_MAP),

    create: base
        .route({
            method: "POST",
            path: "/dags",
            tags: ["DAGs"],
            summary: "Create a DAG",
            description:
                "Registers a new logical DAG. Tasks and dependency edges are added through the DAG-scoped endpoints.",
            successStatus: 201,
            successDescription: "DAG created.",
        })
        .input(createDagBodySchema)
        .output(dagSchema)
        .errors(NOT_IMPLEMENTED_ERROR_MAP),

    get: base
        .route({
            method: "GET",
            path: "/dags/{dagId}",
            tags: ["DAGs"],
            summary: "Get a DAG",
            description:
                "Returns one DAG together with its registered tasks and dependency edges.",
            successDescription: "DAG detail.",
        })
        .input(dagIdParamsSchema)
        .output(dagDetailSchema)
        .errors({ ...NOT_IMPLEMENTED_ERROR_MAP, ...NOT_FOUND_ERROR_MAP }),

    update: base
        .route({
            method: "PATCH",
            path: "/dags/{dagId}",
            tags: ["DAGs"],
            summary: "Update a DAG",
            description: "Updates DAG metadata. Every field is optional.",
            successDescription: "DAG updated.",
        })
        .input(
            v.object({
                ...dagIdParamsSchema.entries,
                ...updateDagBodySchema.entries,
            })
        )
        .output(dagSchema)
        .errors({ ...NOT_IMPLEMENTED_ERROR_MAP, ...NOT_FOUND_ERROR_MAP }),

    delete: base
        .route({
            method: "DELETE",
            path: "/dags/{dagId}",
            tags: ["DAGs"],
            summary: "Delete a DAG",
            description:
                "Deletes a DAG and, by cascade, its tasks, edges, and runs.",
            successStatus: 204,
            successDescription: "DAG deleted.",
        })
        .input(dagIdParamsSchema)
        .errors({ ...NOT_IMPLEMENTED_ERROR_MAP, ...NOT_FOUND_ERROR_MAP }),

    listTasks: base
        .route({
            method: "GET",
            path: "/dags/{dagId}/tasks",
            tags: ["DAGs"],
            summary: "List DAG tasks",
            description: "Returns the registered tasks for one DAG.",
            successDescription: "DAG task list.",
        })
        .input(dagIdParamsSchema)
        .output(dagTaskListSchema)
        .errors({ ...NOT_IMPLEMENTED_ERROR_MAP, ...NOT_FOUND_ERROR_MAP }),

    registerTasks: base
        .route({
            method: "POST",
            path: "/dags/{dagId}/tasks",
            tags: ["DAGs"],
            summary: "Register DAG tasks",
            description:
                "Registers one or more task definitions in a DAG. The `key` must be unique within the DAG.",
            successStatus: 201,
            successDescription: "Tasks registered.",
        })
        .input(
            v.object({
                ...dagIdParamsSchema.entries,
                ...createDagTasksBodySchema.entries,
            })
        )
        .output(dagTaskListSchema)
        .errors({ ...NOT_IMPLEMENTED_ERROR_MAP, ...NOT_FOUND_ERROR_MAP }),

    listEdges: base
        .route({
            method: "GET",
            path: "/dags/{dagId}/edges",
            tags: ["DAGs"],
            summary: "List dependency edges",
            description:
                "Returns the directed dependency edges between the DAG's tasks.",
            successDescription: "DAG edge list.",
        })
        .input(dagIdParamsSchema)
        .output(dagEdgeListSchema)
        .errors({ ...NOT_IMPLEMENTED_ERROR_MAP, ...NOT_FOUND_ERROR_MAP }),

    createEdge: base
        .route({
            method: "POST",
            path: "/dags/{dagId}/edges",
            tags: ["DAGs"],
            summary: "Wire a dependency edge",
            description:
                "Adds a directed edge so the task in `fromTaskId` must finish before `toTaskId` becomes ready.",
            successStatus: 201,
            successDescription: "Dependency edge created.",
        })
        .input(
            v.object({
                ...dagIdParamsSchema.entries,
                ...createDagEdgeBodySchema.entries,
            })
        )
        .output(dagEdgeSchema)
        .errors({ ...NOT_IMPLEMENTED_ERROR_MAP, ...NOT_FOUND_ERROR_MAP }),

    listRuns: base
        .route({
            method: "GET",
            path: "/dags/{dagId}/runs",
            tags: ["DAGs"],
            summary: "List DAG runs",
            description:
                "Returns the execution history for one DAG, optionally filtered by status or trigger type.",
            successDescription: "DAG run list.",
        })
        .input(
            v.object({
                ...dagIdParamsSchema.entries,
                ...dagScopedRunListQuerySchema.entries,
            })
        )
        .output(dagRunListSchema)
        .errors({ ...NOT_IMPLEMENTED_ERROR_MAP, ...NOT_FOUND_ERROR_MAP }),

    triggerRun: base
        .route({
            method: "POST",
            path: "/dags/{dagId}/runs",
            tags: ["DAGs"],
            summary: "Trigger a DAG run",
            description:
                "Creates a new run for the DAG. Reusing `runKey` makes repeated triggers idempotent.",
            successStatus: 202,
            successDescription: "DAG run accepted.",
        })
        .input(
            v.object({
                ...dagIdParamsSchema.entries,
                ...triggerDagRunBodySchema.entries,
            })
        )
        .output(dagRunSchema)
        .errors({ ...NOT_IMPLEMENTED_ERROR_MAP, ...NOT_FOUND_ERROR_MAP }),
};
