import { constants as dagConstants } from "@badag/db-schema/main-db";
import { constants as taskConstants } from "@badag/db-schema/orchestrator-db";
import * as v from "valibot";

// Shared field schemas. Timestamps are ISO 8601 strings on the wire even
// though D1 stores them as epoch milliseconds.
const timestamp = v.pipe(
    v.string(),
    v.isoTimestamp(),
    v.description("ISO 8601 timestamp."),
    v.examples(["2026-01-01T00:00:00.000Z"])
);

const nullableTimestamp = v.nullable(timestamp);

const jsonObject = v.pipe(
    v.record(v.string(), v.unknown()),
    v.description("Arbitrary JSON object.")
);

const nullableJsonObject = v.nullable(jsonObject);

// Path and query values arrive as strings; the handler's smart-coercion plugin
// converts them before these numeric constraints run.
const numericParam = (description: string) =>
    v.pipe(
        v.number(),
        v.integer(),
        v.minValue(1),
        v.description(description),
        v.examples([1])
    );

const paginationProperties = {
    limit: v.optional(
        v.pipe(
            v.number(),
            v.integer(),
            v.minValue(1),
            v.maxValue(100),
            v.description("Maximum number of items to return. Defaults to 20."),
            v.examples([20])
        ),
        20
    ),
    offset: v.optional(
        v.pipe(
            v.number(),
            v.integer(),
            v.minValue(0),
            v.description("Number of items to skip. Defaults to 0."),
            v.examples([0])
        ),
        0
    ),
};

export const pageMetaSchema = v.object({
    limit: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
    offset: v.pipe(v.number(), v.integer(), v.minValue(0)),
    total: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

const dagRunStatusSchema = v.pipe(
    v.picklist(dagConstants.LIST_DAG_RUN_STATUS),
    v.description("Lifecycle state of a DAG run.")
);

const dagRunTriggerSchema = v.pipe(
    v.picklist(dagConstants.LIST_DAG_RUN_TRIGGER),
    v.description("Cause that created a DAG run.")
);

const taskExecutionStatusSchema = v.pipe(
    v.picklist(taskConstants.LIST_TASK_EXECUTION_STATUS),
    v.description("Lifecycle state of a single task execution.")
);

export const dagSchema = v.object({
    id: v.pipe(v.number(), v.integer(), v.minValue(1)),
    name: v.pipe(
        v.string(),
        v.minLength(1),
        v.maxLength(dagConstants.DAG_NAME_MAX_LENGTH),
        v.description("Unique DAG name.")
    ),
    description: v.nullable(v.string()),
    createdAt: timestamp,
    updatedAt: timestamp,
});

export const dagTaskSchema = v.object({
    id: v.pipe(v.number(), v.integer(), v.minValue(1)),
    dagId: v.pipe(v.number(), v.integer(), v.minValue(1)),
    key: v.pipe(
        v.string(),
        v.minLength(1),
        v.maxLength(dagConstants.DAG_TASK_KEY_MAX_LENGTH),
        v.description("Stable identifier used in dependency references.")
    ),
    name: v.pipe(
        v.string(),
        v.minLength(1),
        v.maxLength(dagConstants.DAG_TASK_NAME_MAX_LENGTH)
    ),
    type: v.pipe(
        v.string(),
        v.minLength(1),
        v.maxLength(dagConstants.DAG_TASK_TYPE_MAX_LENGTH),
        v.description("Task kind.")
    ),
    config: jsonObject,
    createdAt: timestamp,
    updatedAt: timestamp,
});

export const dagEdgeSchema = v.object({
    dagId: v.pipe(v.number(), v.integer(), v.minValue(1)),
    fromTaskId: v.pipe(v.number(), v.integer(), v.minValue(1)),
    toTaskId: v.pipe(v.number(), v.integer(), v.minValue(1)),
    createdAt: timestamp,
});

export const dagRunSchema = v.object({
    id: v.pipe(v.number(), v.integer(), v.minValue(1)),
    dagId: v.pipe(v.number(), v.integer(), v.minValue(1)),
    currentTaskId: v.pipe(v.number(), v.integer(), v.minValue(1)),
    status: dagRunStatusSchema,
    triggerType: dagRunTriggerSchema,
    runKey: v.nullable(
        v.pipe(
            v.string(),
            v.description(
                "Idempotency key, typically the scheduler slot for scheduled runs."
            )
        )
    ),
    input: nullableJsonObject,
    output: nullableJsonObject,
    startedAt: nullableTimestamp,
    finishedAt: nullableTimestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
});

export const taskExecutionSchema = v.object({
    id: v.pipe(v.number(), v.integer(), v.minValue(1)),
    taskId: v.pipe(v.number(), v.integer(), v.minValue(1)),
    status: taskExecutionStatusSchema,
    attempt: v.pipe(v.number(), v.integer(), v.minValue(0)),
    input: nullableJsonObject,
    output: nullableJsonObject,
    error: v.nullable(
        v.pipe(v.string(), v.description("Failure reason for this attempt."))
    ),
    startedAt: nullableTimestamp,
    finishedAt: nullableTimestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
});

export const scheduleSchema = v.object({
    id: v.pipe(v.string(), v.description("Schedule identifier.")),
    dagId: v.pipe(v.number(), v.integer(), v.minValue(1)),
    cron: v.pipe(
        v.string(),
        v.minLength(1),
        v.description("Cron expression controlling when the DAG runs.")
    ),
    timezone: v.pipe(
        v.string(),
        v.minLength(1),
        v.description("IANA timezone the cron expression is evaluated in.")
    ),
    enabled: v.boolean(),
    createdAt: timestamp,
    updatedAt: timestamp,
});

export const dagDetailSchema = v.object({
    id: v.pipe(v.number(), v.integer(), v.minValue(1)),
    name: v.pipe(
        v.string(),
        v.minLength(1),
        v.maxLength(dagConstants.DAG_NAME_MAX_LENGTH)
    ),
    description: v.nullable(v.string()),
    tasks: v.array(dagTaskSchema),
    edges: v.array(dagEdgeSchema),
    createdAt: timestamp,
    updatedAt: timestamp,
});

export const dagListSchema = v.object({
    items: v.array(dagSchema),
    meta: pageMetaSchema,
});

export const dagTaskListSchema = v.object({
    items: v.array(dagTaskSchema),
    meta: pageMetaSchema,
});

export const dagEdgeListSchema = v.object({
    items: v.array(dagEdgeSchema),
    meta: pageMetaSchema,
});

export const dagRunListSchema = v.object({
    items: v.array(dagRunSchema),
    meta: pageMetaSchema,
});

export const taskExecutionListSchema = v.object({
    items: v.array(taskExecutionSchema),
    meta: pageMetaSchema,
});

export const scheduleListSchema = v.object({
    items: v.array(scheduleSchema),
    meta: pageMetaSchema,
});

export const apiErrorSchema = v.object({
    code: v.pipe(v.string(), v.description("Machine-readable error code.")),
    message: v.pipe(v.string(), v.description("Human-readable error message.")),
});

export const healthSchema = v.object({
    status: v.literal("ok"),
});

// Path parameters.

export const dagIdParamsSchema = v.object({
    dagId: numericParam("DAG identifier."),
});

export const runIdParamsSchema = v.object({
    runId: numericParam("DAG run identifier."),
});

export const taskExecutionParamsSchema = v.object({
    runId: numericParam("DAG run identifier."),
    taskExecutionId: numericParam("Task execution identifier."),
});

export const scheduleIdParamsSchema = v.object({
    scheduleId: v.pipe(
        v.string(),
        v.minLength(1),
        v.description("Schedule identifier.")
    ),
});

// Query parameters.

export const dagListQuerySchema = v.object({
    ...paginationProperties,
    search: v.optional(
        v.pipe(
            v.string(),
            v.maxLength(dagConstants.DAG_NAME_MAX_LENGTH),
            v.description("Case-insensitive DAG name filter.")
        )
    ),
});

export const dagScopedRunListQuerySchema = v.object({
    ...paginationProperties,
    status: v.optional(dagRunStatusSchema),
    triggerType: v.optional(dagRunTriggerSchema),
});

export const runListQuerySchema = v.object({
    ...paginationProperties,
    dagId: v.optional(numericParam("Filter by DAG identifier.")),
    status: v.optional(dagRunStatusSchema),
    triggerType: v.optional(dagRunTriggerSchema),
});

export const taskExecutionListQuerySchema = v.object({
    ...paginationProperties,
    status: v.optional(taskExecutionStatusSchema),
});

export const scheduleListQuerySchema = v.object({
    ...paginationProperties,
    dagId: v.optional(numericParam("Filter by DAG identifier.")),
    enabled: v.optional(
        v.pipe(
            v.picklist(["true", "false"]),
            v.description(
                "Filter by enabled state. Defaults to all schedules."
            ),
            v.examples(["true"])
        )
    ),
});

// Request bodies.

export const createDagBodySchema = v.object({
    name: v.pipe(
        v.string(),
        v.minLength(1),
        v.maxLength(dagConstants.DAG_NAME_MAX_LENGTH),
        v.description("Unique DAG name.")
    ),
    description: v.optional(v.string()),
});

export const updateDagBodySchema = v.object({
    name: v.optional(
        v.pipe(
            v.string(),
            v.minLength(1),
            v.maxLength(dagConstants.DAG_NAME_MAX_LENGTH)
        )
    ),
    description: v.optional(v.nullable(v.string())),
});

export const createDagTasksBodySchema = v.object({
    tasks: v.pipe(
        v.array(
            v.object({
                key: v.pipe(
                    v.string(),
                    v.minLength(1),
                    v.maxLength(dagConstants.DAG_TASK_KEY_MAX_LENGTH),
                    v.description(
                        "Stable identifier used in dependency references."
                    )
                ),
                name: v.pipe(
                    v.string(),
                    v.minLength(1),
                    v.maxLength(dagConstants.DAG_TASK_NAME_MAX_LENGTH)
                ),
                type: v.pipe(
                    v.string(),
                    v.minLength(1),
                    v.maxLength(dagConstants.DAG_TASK_TYPE_MAX_LENGTH),
                    v.description("Task kind.")
                ),
                config: v.optional(jsonObject),
            })
        ),
        v.minLength(1)
    ),
});

export const createDagEdgeBodySchema = v.object({
    fromTaskId: v.pipe(v.number(), v.integer(), v.minValue(1)),
    toTaskId: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

export const triggerDagRunBodySchema = v.object({
    runKey: v.optional(
        v.pipe(
            v.string(),
            v.minLength(1),
            v.description(
                "Idempotency key; repeated triggers with the same key reuse the run."
            )
        )
    ),
    input: v.optional(jsonObject),
});

export const upsertScheduleBodySchema = v.object({
    dagId: v.pipe(v.number(), v.integer(), v.minValue(1)),
    cron: v.pipe(
        v.string(),
        v.minLength(1),
        v.description("Cron expression controlling when the DAG runs.")
    ),
    timezone: v.optional(
        v.pipe(
            v.string(),
            v.minLength(1),
            v.description("IANA timezone the cron expression is evaluated in.")
        ),
        "UTC"
    ),
    enabled: v.optional(v.boolean(), true),
});

// Reusable components referenced by the generated OpenAPI document. The
// Valibot JSON Schema converter matches schemas by identity, so these entries
// become `components.schemas` instead of inline object schemas.
export const apiDefinitions = {
    PageMeta: pageMetaSchema,
    Dag: dagSchema,
    DagTask: dagTaskSchema,
    DagEdge: dagEdgeSchema,
    DagRun: dagRunSchema,
    TaskExecution: taskExecutionSchema,
    Schedule: scheduleSchema,
    DagDetail: dagDetailSchema,
    DagList: dagListSchema,
    DagTaskList: dagTaskListSchema,
    DagEdgeList: dagEdgeListSchema,
    DagRunList: dagRunListSchema,
    TaskExecutionList: taskExecutionListSchema,
    ScheduleList: scheduleListSchema,
    ApiError: apiErrorSchema,
    Health: healthSchema,
} as const;
