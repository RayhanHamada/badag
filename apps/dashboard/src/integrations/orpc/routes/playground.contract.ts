import * as v from "valibot";

import {
    WORKFLOW_INPUT_LIMIT,
    WORKFLOW_STEP_LIMIT,
    WORKFLOW_STEP_NAME_PATTERN,
    WORKFLOW_TENANT_ID_PATTERN,
    workflowOperations,
    workflowRunStatuses,
} from "@/features/playground/workflow-spec";

import { base } from "../base";
import { NOT_FOUND_ERROR_MAP, TENANT_ERROR_MAP } from "../errors";

const workflowStepSchema = v.object({
    name: v.pipe(
        v.string(),
        v.regex(WORKFLOW_STEP_NAME_PATTERN),
        v.description("Unique step name within the workflow."),
        v.examples(["normalize"])
    ),
    operation: v.pipe(
        v.picklist(workflowOperations),
        v.description("Transform the step applies to the payload."),
        v.examples(["uppercase"])
    ),
});

export const createPlaygroundRunSchema = v.object({
    tenantId: v.pipe(
        v.string(),
        v.regex(WORKFLOW_TENANT_ID_PATTERN),
        v.description(
            "Tenant that owns the generated workflow module. Changing it changes which dynamic worker runs the steps."
        ),
        v.examples(["acme"])
    ),
    input: v.pipe(
        v.string(),
        v.maxLength(WORKFLOW_INPUT_LIMIT),
        v.description("Payload handed to the tenant workflow."),
        v.examples(["hello from acme"])
    ),
    steps: v.pipe(
        v.array(workflowStepSchema),
        v.minLength(1),
        v.maxLength(WORKFLOW_STEP_LIMIT),
        v.check(
            (steps) =>
                new Set(steps.map((step) => step.name)).size === steps.length,
            "Step names must be unique."
        ),
        v.description("Ordered pipeline the tenant module compiles.")
    ),
});

export const playgroundRunParamsSchema = v.object({
    runId: v.pipe(
        v.string(),
        v.minLength(1),
        v.description("Workflow instance id."),
        v.examples(["run_8f2a"])
    ),
});

export const playgroundRunHandleSchema = v.object({
    id: v.pipe(v.string(), v.description("Workflow instance id.")),
    tenantId: v.string(),
});

export const playgroundRunDetailSchema = v.object({
    id: v.string(),
    status: v.picklist(workflowRunStatuses),
    error: v.nullable(
        v.object({
            name: v.string(),
            message: v.string(),
        })
    ),
    output: v.nullable(v.unknown()),
});

// Schemas referenced by the generated OpenAPI document by identity.
export const playgroundDefinitions = {
    PlaygroundWorkflowRun: playgroundRunHandleSchema,
    PlaygroundWorkflowRunStatus: playgroundRunDetailSchema,
} as const;

export const playgroundContract = {
    createRun: base
        .route({
            method: "POST",
            path: "/playground/runs",
            tags: ["Playground"],
            summary: "Start a dynamic workflow",
            description:
                "Generates a tenant workflow module, loads it through the Worker Loader, and lets it create a Workflow run through a dispatcher-wrapped binding. The returned id is a single `DynamicWorkflow` instance, not a tenant-specific Workflow.",
            successStatus: 201,
            successDescription: "Workflow run created.",
        })
        .input(createPlaygroundRunSchema)
        .output(playgroundRunHandleSchema)
        .errors(TENANT_ERROR_MAP),

    getRun: base
        .route({
            method: "GET",
            path: "/playground/runs/{runId}",
            tags: ["Playground"],
            summary: "Get a dynamic workflow run",
            description:
                "Returns the status of a run created through the playground, including the tenant's output and step trace once it completes.",
            successDescription: "Workflow run status.",
        })
        .input(playgroundRunParamsSchema)
        .output(playgroundRunDetailSchema)
        .errors(NOT_FOUND_ERROR_MAP),
};
