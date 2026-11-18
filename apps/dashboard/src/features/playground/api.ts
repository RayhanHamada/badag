import { z } from "zod";

import {
    workflowRunHandleSchema,
    workflowRunSnapshotSchema,
} from "./workflow-spec";
import type {
    CreateWorkflowRun,
    WorkflowRunHandle,
    WorkflowRunSnapshot,
} from "./workflow-spec";

const apiErrorSchema = z.object({ code: z.string(), message: z.string() });

async function readJson(response: Response): Promise<unknown> {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

export async function createWorkflowRun(
    body: CreateWorkflowRun
): Promise<WorkflowRunHandle> {
    const response = await fetch("/api/v1/playground/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });

    const payload = await readJson(response);

    if (!response.ok) {
        const apiError = apiErrorSchema.safeParse(payload);

        throw new Error(
            apiError.success
                ? apiError.data.message
                : `The workflow run could not be started (${response.status}).`
        );
    }

    const handle = workflowRunHandleSchema.safeParse(payload);

    if (!handle.success) {
        throw new Error("The API returned an unexpected workflow run handle.");
    }

    return handle.data;
}

export async function fetchWorkflowRun(
    id: string
): Promise<WorkflowRunSnapshot> {
    const response = await fetch(
        `/api/v1/playground/runs/${encodeURIComponent(id)}`
    );

    const payload = await readJson(response);

    if (!response.ok) {
        const apiError = apiErrorSchema.safeParse(payload);

        throw new Error(
            apiError.success
                ? apiError.data.message
                : `The workflow run could not be loaded (${response.status}).`
        );
    }

    const snapshot = workflowRunSnapshotSchema.safeParse(payload);

    if (!snapshot.success) {
        throw new Error("The API returned an unexpected workflow run status.");
    }

    return snapshot.data;
}
