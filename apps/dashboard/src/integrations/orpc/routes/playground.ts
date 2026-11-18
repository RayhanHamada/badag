import { implement } from "@orpc/server";
import { env } from "cloudflare:workers";
import * as v from "valibot";

import { definePlaygroundWorker } from "@/features/playground/dynamic-worker";
import type { WorkflowSpec } from "@/features/playground/workflow-spec";
import { loadDynamicWorker } from "@/integrations/dynamic-worker/loader";

import { playgroundContract } from "./playground.contract";

const os = implement(playgroundContract);

export const playgroundRouter = os.router({
    createRun: os.createRun.handler(async ({ errors, input }) => {
        const { tenantId, steps } = input;
        const spec: WorkflowSpec = { tenantId, steps };
        const definition = await definePlaygroundWorker(spec);
        const stub = loadDynamicWorker(env, definition);
        const tenant = stub.getEntrypoint();

        let response: Response;

        try {
            response = await tenant.fetch("https://tenant.internal/runs", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ input: input.input }),
            });
        } catch (error) {
            throw errors.TENANT_ERROR({
                message:
                    error instanceof Error
                        ? error.message
                        : "The tenant worker failed to start.",
            });
        }

        if (!response.ok) {
            throw errors.TENANT_ERROR({
                message: `The tenant worker responded with ${response.status}.`,
            });
        }

        const payload: unknown = await response.json();

        const handle = v.safeParse(
            v.object({ id: v.pipe(v.string(), v.minLength(1)) }),
            payload
        );

        if (!handle.success) {
            throw errors.TENANT_ERROR({
                message:
                    "The tenant worker returned an unexpected create response.",
            });
        }

        return { id: handle.output.id, tenantId };
    }),

    getRun: os.getRun.handler(async ({ errors, input }) => {
        const instance = await env.DYNAMIC_WORKFLOW.get(input.runId).catch(
            () => null
        );

        if (instance === null) {
            throw errors.NOT_FOUND({
                message: "Unknown workflow run.",
            });
        }

        const snapshot = await instance.status();

        return {
            id: input.runId,
            status: snapshot.status,
            error: snapshot.error ?? null,
            output: snapshot.output ?? null,
        };
    }),
});
