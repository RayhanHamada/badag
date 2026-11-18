import { AlertCircleIcon, PlayIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    CodeBlock,
    CodeBlockContent,
    CodeBlockCopyButton,
    CodeBlockHeader,
    CodeBlockTitle,
} from "@/components/ui/code-block";
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

import {
    isTerminalWorkflowRunStatus,
    workflowResultSchema,
} from "../workflow-spec";
import type { WorkflowRunSnapshot, WorkflowRunStatus } from "../workflow-spec";

const statusDot: Record<WorkflowRunStatus, string> = {
    complete: "bg-success",
    errored: "bg-destructive",
    terminated: "bg-destructive",
    running: "bg-warning",
    queued: "bg-warning",
    waiting: "bg-warning",
    waitingForPause: "bg-warning",
    rollingBack: "bg-warning",
    paused: "bg-muted-foreground",
    unknown: "bg-muted-foreground",
};

interface WorkflowRunPanelProps {
    runId: string | null;
    snapshot: WorkflowRunSnapshot | undefined;
    error: Error | null;
}

export const WorkflowRunPanel = ({
    runId,
    snapshot,
    error,
}: WorkflowRunPanelProps) => {
    const parsedOutput =
        snapshot === undefined || snapshot.output === null
            ? null
            : workflowResultSchema.safeParse(snapshot.output);

    const running =
        snapshot !== undefined && !isTerminalWorkflowRunStatus(snapshot.status);

    let content: ReactNode;

    if (runId === null) {
        content = (
            <Empty>
                <EmptyHeader>
                    <EmptyMedia variant="icon">
                        <PlayIcon />
                    </EmptyMedia>
                    <EmptyTitle>No run yet</EmptyTitle>
                    <EmptyDescription>
                        Run the workflow to watch its durable steps and read the
                        tenant output.
                    </EmptyDescription>
                </EmptyHeader>
            </Empty>
        );
    } else if (error) {
        content = (
            <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertTitle>Could not load the run</AlertTitle>
                <AlertDescription>{error.message}</AlertDescription>
            </Alert>
        );
    } else if (snapshot === undefined) {
        content = (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <Spinner />
                Starting workflow…
            </p>
        );
    } else {
        content = (
            <div className="flex flex-col gap-4">
                <p className="text-muted-foreground truncate font-mono text-xs">
                    {snapshot.id}
                </p>
                {snapshot.error ? (
                    <Alert variant="destructive">
                        <AlertCircleIcon />
                        <AlertTitle>{snapshot.error.name}</AlertTitle>
                        <AlertDescription>
                            {snapshot.error.message}
                        </AlertDescription>
                    </Alert>
                ) : null}
                {running ? (
                    <p className="text-muted-foreground flex items-center gap-2 text-sm">
                        <Spinner />
                        Waiting for the workflow to finish…
                    </p>
                ) : null}
                {parsedOutput?.success ? (
                    <>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-8">#</TableHead>
                                    <TableHead>Step</TableHead>
                                    <TableHead>Operation</TableHead>
                                    <TableHead>Value</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {parsedOutput.data.trace.map((entry, index) => (
                                    <TableRow key={`${entry.step}-${index}`}>
                                        <TableCell>{index + 1}</TableCell>
                                        <TableCell>{entry.step}</TableCell>
                                        <TableCell>{entry.operation}</TableCell>
                                        <TableCell>
                                            <span className="font-mono text-xs">
                                                {entry.value || "—"}
                                            </span>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        <CodeBlock size="sm">
                            <CodeBlockHeader>
                                <CodeBlockTitle>Output</CodeBlockTitle>
                                <CodeBlockCopyButton
                                    value={parsedOutput.data.output}
                                />
                            </CodeBlockHeader>
                            <CodeBlockContent wrap>
                                {parsedOutput.data.output}
                            </CodeBlockContent>
                        </CodeBlock>
                        <p className="text-muted-foreground text-xs">
                            Handled by tenant{" "}
                            <span className="text-foreground font-mono">
                                {parsedOutput.data.tenantId}
                            </span>{" "}
                            through{" "}
                            <span className="font-mono">DynamicWorkflow</span>.
                        </p>
                    </>
                ) : null}
                {snapshot.status === "complete" &&
                parsedOutput !== null &&
                !parsedOutput.success ? (
                    <CodeBlock size="sm">
                        <CodeBlockHeader>
                            <CodeBlockTitle>Output</CodeBlockTitle>
                        </CodeBlockHeader>
                        <CodeBlockContent wrap>
                            {JSON.stringify(snapshot.output, null, 2)}
                        </CodeBlockContent>
                    </CodeBlock>
                ) : null}
            </div>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Run</CardTitle>
                <CardDescription>
                    {runId === null
                        ? "No instance yet."
                        : "Live status from the dispatcher."}
                </CardDescription>
                {snapshot ? (
                    <CardAction>
                        <Badge variant="outline">
                            <span
                                className={`size-1.5 rounded-full ${statusDot[snapshot.status]}`}
                            />
                            {snapshot.status}
                        </Badge>
                    </CardAction>
                ) : null}
            </CardHeader>
            <CardContent>{content}</CardContent>
        </Card>
    );
};
