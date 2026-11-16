import { createRoute, z } from "@hono/zod-openapi";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { env } from "cloudflare:workers";

import { definePlaygroundWorker } from "@/features/playground/dynamic-worker";
import {
    WORKFLOW_INPUT_LIMIT,
    WORKFLOW_STEP_LIMIT,
    WORKFLOW_STEP_NAME_PATTERN,
    WORKFLOW_TENANT_ID_PATTERN,
    workflowOperations,
    workflowRunStatuses,
} from "@/features/playground/workflow-spec";
import type { WorkflowSpec } from "@/features/playground/workflow-spec";
import { loadDynamicWorker } from "@/integrations/dynamic-worker/loader";

import { apiErrorSchema } from "../models";
import { jsonResponse } from "../shared";

const tenantErrorResponse = jsonResponse(
    apiErrorSchema,
    "The tenant worker could not start the workflow."
);

const runIdParamsSchema = z.object({
    runId: z
        .string()
        .min(1)
        .openapi({ description: "Workflow instance id.", example: "run_8f2a" }),
});

const workflowStepSchema = z.object({
    name: z.string().regex(WORKFLOW_STEP_NAME_PATTERN).openapi({
        description: "Unique step name within the workflow.",
        example: "normalize",
    }),
    operation: z.enum(workflowOperations).openapi({
        description: "Transform the step applies to the payload.",
        example: "uppercase",
    }),
});

const createRunBodySchema = z.object({
    tenantId: z.string().regex(WORKFLOW_TENANT_ID_PATTERN).openapi({
        description:
            "Tenant that owns the generated workflow module. Changing it changes which dynamic worker runs the steps.",
        example: "acme",
    }),
    input: z.string().max(WORKFLOW_INPUT_LIMIT).openapi({
        description: "Payload handed to the tenant workflow.",
        example: "hello from acme",
    }),
    steps: z
        .array(workflowStepSchema)
        .min(1)
        .max(WORKFLOW_STEP_LIMIT)
        .refine(
            (steps) =>
                new Set(steps.map((step) => step.name)).size === steps.length,
            {
                message: "Step names must be unique.",
                path: ["steps"],
            }
        )
        .openapi({
            description: "Ordered pipeline the tenant module compiles.",
        }),
});

const runHandleSchema = z
    .object({
        id: z.string().openapi({ description: "Workflow instance id." }),
        tenantId: z.string(),
    })
    .openapi("PlaygroundWorkflowRun");

const runDetailSchema = z
    .object({
        id: z.string(),
        status: z.enum(workflowRunStatuses),
        error: z
            .object({
                name: z.string(),
                message: z.string(),
            })
            .nullable(),
        output: z.unknown().nullable(),
    })
    .openapi("PlaygroundWorkflowRunStatus");

const createRunRoute = createRoute({
    method: "post",
    path: "/api/v1/playground/runs",
    tags: ["Playground"],
    summary: "Start a dynamic workflow",
    description:
        "Generates a tenant workflow module, loads it through the Worker Loader, and lets it create a Workflow run through a dispatcher-wrapped binding. The returned id is a single `DynamicWorkflow` instance, not a tenant-specific Workflow.",
    request: {
        body: {
            content: { "application/json": { schema: createRunBodySchema } },
            required: true,
        },
    },
    responses: {
        201: jsonResponse(runHandleSchema, "Workflow run created."),
        422: jsonResponse(apiErrorSchema, "Invalid request."),
        502: tenantErrorResponse,
    },
});

const getRunRoute = createRoute({
    method: "get",
    path: "/api/v1/playground/runs/{runId}",
    tags: ["Playground"],
    summary: "Get a dynamic workflow run",
    description:
        "Returns the status of a run created through the playground, including the tenant's output and step trace once it completes.",
    request: {
        params: runIdParamsSchema,
    },
    responses: {
        200: jsonResponse(runDetailSchema, "Workflow run status."),
        404: jsonResponse(apiErrorSchema, "Unknown workflow run."),
        422: jsonResponse(apiErrorSchema, "Invalid request."),
    },
});

export function registerPlaygroundRoutes(app: OpenAPIHono): void {
    app.openapi(createRunRoute, async (c) => {
        const { tenantId, input, steps } = c.req.valid("json");
        const spec: WorkflowSpec = { tenantId, steps };
        const definition = await definePlaygroundWorker(spec);
        const stub = loadDynamicWorker(env, definition);
        const tenant = stub.getEntrypoint();

        let response: Response;

        try {
            response = await tenant.fetch("https://tenant.internal/runs", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ input }),
            });
        } catch (error) {
            return c.json(
                {
                    code: "tenant_error",
                    message:
                        error instanceof Error
                            ? error.message
                            : "The tenant worker failed to start.",
                },
                502
            );
        }

        if (!response.ok) {
            return c.json(
                {
                    code: "tenant_error",
                    message: `The tenant worker responded with ${response.status}.`,
                },
                502
            );
        }

        const payload: unknown = await response.json();

        const handle = z.object({ id: z.string().min(1) }).safeParse(payload);

        if (!handle.success) {
            return c.json(
                {
                    code: "tenant_error",
                    message:
                        "The tenant worker returned an unexpected create response.",
                },
                502
            );
        }

        return c.json({ id: handle.data.id, tenantId }, 201);
    });

    app.openapi(getRunRoute, async (c) => {
        const { runId } = c.req.valid("param");

        const instance = await env.DYNAMIC_WORKFLOW.get(runId).catch(
            () => null
        );

        if (instance === null) {
            return c.json(
                { code: "not_found", message: "Unknown workflow run." },
                404
            );
        }

        const snapshot = await instance.status();

        return c.json(
            {
                id: runId,
                status: snapshot.status,
                error: snapshot.error ?? null,
                output: snapshot.output ?? null,
            },
            200
        );
    });
}
