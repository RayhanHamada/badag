import { useMutation, useQuery } from "@tanstack/react-query";
import { FlaskConicalIcon, PlayIcon } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    CodeBlock,
    CodeBlockActions,
    CodeBlockContent,
    CodeBlockCopyButton,
    CodeBlockHeader,
    CodeBlockTitle,
} from "@/components/ui/code-block";
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
    FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import { createWorkflowRun, fetchWorkflowRun } from "../api";
import {
    buildTenantModuleSource,
    DEFAULT_WORKFLOW_INPUT,
    DEFAULT_WORKFLOW_SPEC,
    isTerminalWorkflowRunStatus,
    WORKFLOW_INPUT_LIMIT,
    workflowSpecSchema,
} from "../workflow-spec";
import type { WorkflowSpec } from "../workflow-spec";
import { StepsField } from "./steps-field";
import type { EditableStep } from "./steps-field";
import { WorkflowRunPanel } from "./workflow-run-panel";

export const PlaygroundPage = () => {
    const [tenantId, setTenantId] = useState(DEFAULT_WORKFLOW_SPEC.tenantId);
    const [input, setInput] = useState(DEFAULT_WORKFLOW_INPUT);

    const [steps, setSteps] = useState<EditableStep[]>(() =>
        DEFAULT_WORKFLOW_SPEC.steps.map((step, index) => ({
            ...step,
            id: `default-step-${index}`,
        }))
    );

    const [runId, setRunId] = useState<string | null>(null);

    const spec: WorkflowSpec = {
        tenantId,
        steps: steps.map(({ name, operation }) => ({ name, operation })),
    };

    const validation = workflowSpecSchema.safeParse(spec);
    const issues = validation.success ? [] : validation.error.issues;

    const tenantErrors = issues
        .filter((issue) => issue.path[0] === "tenantId")
        .map((issue) => ({ message: issue.message }));

    const stepErrors = issues
        .filter((issue) => issue.path[0] === "steps")
        .map((issue) => ({ message: issue.message }));

    const createRun = useMutation({
        mutationFn: createWorkflowRun,
        onSuccess: (handle) => {
            setRunId(handle.id);
        },
    });

    const runQuery = useQuery({
        queryKey: ["playground", "run", runId],
        queryFn: async () => {
            if (runId === null) {
                throw new Error("No workflow run selected.");
            }

            return await fetchWorkflowRun(runId);
        },
        enabled: runId !== null,
        refetchInterval: (query) =>
            isTerminalWorkflowRunStatus(query.state.data?.status) ? false : 800,
    });

    const startRun = () => {
        if (!validation.success) {
            return;
        }

        createRun.mutate({ ...validation.data, input });
    };

    const moduleSource = buildTenantModuleSource(spec);

    return (
        <div className="flex flex-col gap-6">
            <p className="text-muted-foreground max-w-3xl text-sm text-pretty">
                Every run is a real Cloudflare Workflow created through one
                dispatcher. Change the tenant or the steps and the playground
                regenerates the tenant module that the Worker Loader executes —
                no deploy, no new Workflow binding.
            </p>
            <div className="grid gap-4 xl:grid-cols-5">
                <div className="flex min-w-0 flex-col gap-4 xl:col-span-3">
                    <Card>
                        <CardHeader>
                            <CardTitle>Tenant workflow</CardTitle>
                            <CardDescription>
                                Pick the tenant and the steps its generated
                                module runs.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <FieldGroup>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field>
                                        <FieldLabel htmlFor="workflow-tenant">
                                            Tenant id
                                        </FieldLabel>
                                        <Input
                                            aria-invalid={
                                                tenantErrors.length > 0
                                            }
                                            autoComplete="off"
                                            id="workflow-tenant"
                                            maxLength={32}
                                            onChange={(event) =>
                                                setTenantId(event.target.value)
                                            }
                                            spellCheck={false}
                                            value={tenantId}
                                        />
                                        <FieldDescription>
                                            Keys the dynamically loaded worker.
                                        </FieldDescription>
                                        <FieldError errors={tenantErrors} />
                                    </Field>
                                    <Field>
                                        <FieldLabel htmlFor="workflow-input">
                                            Input
                                        </FieldLabel>
                                        <Input
                                            id="workflow-input"
                                            maxLength={WORKFLOW_INPUT_LIMIT}
                                            onChange={(event) =>
                                                setInput(event.target.value)
                                            }
                                            value={input}
                                        />
                                        <FieldDescription>
                                            Payload of the Workflow instance.
                                        </FieldDescription>
                                    </Field>
                                </div>
                                <Field>
                                    <FieldTitle>Steps</FieldTitle>
                                    <FieldDescription>
                                        Each step becomes a durable{" "}
                                        <code className="font-mono">
                                            step.do
                                        </code>{" "}
                                        in the tenant workflow.
                                    </FieldDescription>
                                    <StepsField
                                        errors={stepErrors}
                                        onChange={setSteps}
                                        steps={steps}
                                    />
                                </Field>
                            </FieldGroup>
                            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                                <p className="text-muted-foreground text-xs">
                                    Runs survive reloads and hibernation.
                                </p>
                                <Button
                                    disabled={
                                        !validation.success ||
                                        createRun.isPending
                                    }
                                    onClick={startRun}
                                >
                                    {createRun.isPending ? (
                                        <Spinner data-icon="inline-start" />
                                    ) : (
                                        <PlayIcon data-icon="inline-start" />
                                    )}
                                    Run workflow
                                </Button>
                            </div>
                            {createRun.error ? (
                                <Alert className="mt-4" variant="destructive">
                                    <AlertTitle>
                                        Could not start the workflow
                                    </AlertTitle>
                                    <AlertDescription>
                                        {createRun.error.message}
                                    </AlertDescription>
                                </Alert>
                            ) : null}
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Generated tenant module</CardTitle>
                            <CardDescription>
                                What the Worker Loader executes for{" "}
                                <span className="font-mono">
                                    {spec.tenantId || "this tenant"}
                                </span>
                                .
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <CodeBlock size="sm">
                                <CodeBlockHeader>
                                    <CodeBlockTitle>tenant.js</CodeBlockTitle>
                                    <CodeBlockActions>
                                        <CodeBlockCopyButton
                                            value={moduleSource}
                                        />
                                    </CodeBlockActions>
                                </CodeBlockHeader>
                                <CodeBlockContent lineNumbers>
                                    {moduleSource}
                                </CodeBlockContent>
                            </CodeBlock>
                        </CardContent>
                    </Card>
                </div>
                <div className="flex min-w-0 flex-col gap-4 xl:col-span-2">
                    <WorkflowRunPanel
                        error={runQuery.error}
                        runId={runId}
                        snapshot={runQuery.data}
                    />
                    <Card>
                        <CardHeader>
                            <CardTitle>Dispatcher path</CardTitle>
                            <CardDescription>
                                What happens after you press run.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ol className="text-muted-foreground flex list-decimal flex-col gap-3 pl-4 text-sm">
                                <li>
                                    <code className="text-foreground font-mono">
                                        POST /api/v1/playground/runs
                                    </code>{" "}
                                    compiles the steps into a tenant module and
                                    loads it with{" "}
                                    <code className="font-mono">
                                        LOADER.get
                                    </code>
                                    .
                                </li>
                                <li>
                                    The tenant calls{" "}
                                    <code className="font-mono">
                                        env.WORKFLOWS.create()
                                    </code>
                                    ; the wrapped binding tags the run with the
                                    tenant and step spec.
                                </li>
                                <li>
                                    <code className="font-mono">
                                        DynamicWorkflow
                                    </code>{" "}
                                    reads that tag, regenerates the module, and
                                    forwards{" "}
                                    <code className="font-mono">run()</code> to{" "}
                                    <code className="font-mono">
                                        TenantWorkflow
                                    </code>
                                    .
                                </li>
                                <li>
                                    <code className="text-foreground font-mono">
                                        GET /api/v1/playground/runs/:id
                                    </code>{" "}
                                    polls the single dispatcher instance until
                                    it completes.
                                </li>
                            </ol>
                        </CardContent>
                    </Card>
                    <p className="text-muted-foreground flex items-center gap-2 px-1 text-xs">
                        <FlaskConicalIcon className="size-3.5" />
                        Local dev runs the same dispatcher binding as
                        production.
                    </p>
                </div>
            </div>
        </div>
    );
};
