import { createDynamicWorkflowEntrypoint } from "@cloudflare/dynamic-workflows";
import type { WorkflowRunner } from "@cloudflare/dynamic-workflows";

import { dynamicWorkerDefinitionSchema } from "./definition";
import { loadDynamicWorker } from "./loader";

// The dispatcher every dynamic workflow run returns to. It rebuilds the worker
// from the metadata attached at `create()` time and forwards `run()` into the
// module's entrypoint, so it never learns which feature produced the run.
export function createDynamicWorkerEntrypoint() {
    return createDynamicWorkflowEntrypoint<Env, unknown, unknown>(
        async ({ env, metadata }) => {
            const definition =
                dynamicWorkerDefinitionSchema.safeParse(metadata);

            if (!definition.success) {
                throw new Error(
                    `Dynamic worker metadata is not a valid definition: ${definition.error.message}`
                );
            }

            const stub = loadDynamicWorker(env, definition.data);

            // SAFETY: `entrypoint` names a class the generated module exports;
            // the dispatcher only forwards `run()` over the loader stub.
            // oxlint-disable-next-line anti-slop/no-chained-type-assertions
            return stub.getEntrypoint(
                definition.data.entrypoint
            ) as unknown as WorkflowRunner;
        }
    );
}
