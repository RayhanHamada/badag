import { z } from "zod";

// A playground workflow is a small, declarative pipeline. The same spec is
// validated by the API, rendered in the browser, and compiled into the tenant
// module that the Worker Loader runs.

export const WORKFLOW_TENANT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/u;
export const WORKFLOW_STEP_NAME_PATTERN = /^[a-z][a-z0-9_]{0,31}$/u;
export const WORKFLOW_STEP_LIMIT = 6;
export const WORKFLOW_INPUT_LIMIT = 2000;

export const workflowOperations = [
    "uppercase",
    "lowercase",
    "reverse",
    "exclaim",
    "pause",
] as const;

export const workflowOperationSchema = z.enum(workflowOperations);

export type WorkflowOperation = (typeof workflowOperations)[number];

export interface WorkflowOperationOption {
    value: WorkflowOperation;
    label: string;
    description: string;
}

export const workflowOperationOptions: readonly WorkflowOperationOption[] = [
    {
        value: "uppercase",
        label: "Uppercase",
        description: "Transform the payload to uppercase.",
    },
    {
        value: "lowercase",
        label: "Lowercase",
        description: "Transform the payload to lowercase.",
    },
    {
        value: "reverse",
        label: "Reverse",
        description: "Reverse the characters in the payload.",
    },
    {
        value: "exclaim",
        label: "Exclaim",
        description: "Append an exclamation mark to the payload.",
    },
    {
        value: "pause",
        label: "Pause 1s",
        description: "Sleep for one second inside the workflow.",
    },
];

export const workflowStepSchema = z.object({
    name: z
        .string()
        .regex(
            WORKFLOW_STEP_NAME_PATTERN,
            "Step names start with a letter and may contain lowercase letters, digits, and underscores."
        ),
    operation: workflowOperationSchema,
});

export type WorkflowStep = z.infer<typeof workflowStepSchema>;

const workflowSpecFields = {
    tenantId: z
        .string()
        .regex(
            WORKFLOW_TENANT_ID_PATTERN,
            "Tenant ids start with a lowercase letter or digit and may contain lowercase letters, digits, and dashes."
        ),
    steps: z.array(workflowStepSchema).min(1).max(WORKFLOW_STEP_LIMIT),
};

const requireUniqueStepNames = (
    spec: { steps: readonly WorkflowStep[] },
    context: z.RefinementCtx
) => {
    const seen = new Set<string>();

    for (const [index, step] of spec.steps.entries()) {
        if (seen.has(step.name)) {
            context.addIssue({
                code: "custom",
                message: `Duplicate step name "${step.name}". Step names must be unique.`,
                path: ["steps", index, "name"],
            });
        }

        seen.add(step.name);
    }
};

export const workflowSpecSchema = z
    .object(workflowSpecFields)
    .superRefine(requireUniqueStepNames);

export type WorkflowSpec = z.infer<typeof workflowSpecSchema>;

export const createWorkflowRunSchema = z
    .object({
        ...workflowSpecFields,
        input: z.string().max(WORKFLOW_INPUT_LIMIT),
    })
    .superRefine(requireUniqueStepNames);

export type CreateWorkflowRun = z.infer<typeof createWorkflowRunSchema>;

export interface WorkflowRunParams {
    input: string;
}

export const workflowTraceEntrySchema = z.object({
    step: z.string(),
    operation: workflowOperationSchema,
    value: z.string(),
});

export const workflowResultSchema = z.object({
    tenantId: z.string(),
    input: z.string(),
    output: z.string(),
    trace: z.array(workflowTraceEntrySchema),
});

export type WorkflowResult = z.infer<typeof workflowResultSchema>;

export const workflowRunStatuses = [
    "queued",
    "running",
    "paused",
    "errored",
    "terminated",
    "complete",
    "waiting",
    "waitingForPause",
    "rollingBack",
    "unknown",
] as const;

export const workflowRunStatusSchema = z.enum(workflowRunStatuses);

export type WorkflowRunStatus = z.infer<typeof workflowRunStatusSchema>;

export const workflowRunErrorSchema = z.object({
    name: z.string(),
    message: z.string(),
});

export const workflowRunHandleSchema = z.object({
    id: z.string().min(1),
    tenantId: z.string(),
});

export type WorkflowRunHandle = z.infer<typeof workflowRunHandleSchema>;

export const workflowRunSnapshotSchema = z.object({
    id: z.string().min(1),
    status: workflowRunStatusSchema,
    error: workflowRunErrorSchema.nullable(),
    output: z.unknown().nullable(),
});

export type WorkflowRunSnapshot = z.infer<typeof workflowRunSnapshotSchema>;

const terminalWorkflowRunStatuses: Partial<Record<WorkflowRunStatus, true>> = {
    complete: true,
    errored: true,
    terminated: true,
};

export function isTerminalWorkflowRunStatus(
    status: WorkflowRunStatus | undefined
): boolean {
    return status !== undefined && terminalWorkflowRunStatuses[status] === true;
}

export const DEFAULT_WORKFLOW_SPEC: WorkflowSpec = {
    tenantId: "acme",
    steps: [
        { name: "normalize", operation: "uppercase" },
        { name: "settle", operation: "pause" },
        { name: "decorate", operation: "exclaim" },
    ],
};

export const DEFAULT_WORKFLOW_INPUT = "hello from acme";

// Compiles the spec into the source of the tenant's dynamic worker. The
// tenant only depends on `cloudflare:workers`; the dispatcher regenerates the
// same source from persisted metadata when the workflow runs, so no build
// step or redeploy is involved.
export function buildTenantModuleSource(spec: WorkflowSpec): string {
    const steps = JSON.stringify(spec.steps);
    const tenantId = JSON.stringify(spec.tenantId);

    return `// Generated by the Badag workflow playground.
// Loaded per tenant by the DynamicWorkflow dispatcher.
import { WorkflowEntrypoint } from "cloudflare:workers";

const TENANT_ID = ${tenantId};
const STEPS = ${steps};

const OPERATIONS = {
  uppercase: (value) => value.toUpperCase(),
  lowercase: (value) => value.toLowerCase(),
  reverse: (value) => [...value].reverse().join(""),
  exclaim: (value) => value + "!",
};

export class TenantWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const input = typeof event.payload?.input === "string" ? event.payload.input : "";
    const trace = [];
    let value = input;

    for (const entry of STEPS) {
      if (entry.operation === "pause") {
        await step.sleep("pause:" + entry.name, "1 second");
      } else {
        const transform = OPERATIONS[entry.operation];
        value = await step.do(entry.name, async () => transform(value));
      }

      trace.push({ step: entry.name, operation: entry.operation, value });
    }

    return { tenantId: TENANT_ID, input, output: value, trace };
  }
}

export default {
  async fetch(request, env) {
    const body = await request.json();
    const input = typeof body.input === "string" ? body.input : "";
    const instance = await env.WORKFLOWS.create({ params: { input } });

    return Response.json({ id: await instance.id });
  },
};
`;
}
