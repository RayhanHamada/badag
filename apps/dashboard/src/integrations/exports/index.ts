// oxlint-disable no-unused-private-class-members

// Durable Object and Workflow classes exported by the dashboard worker.
// Re-exported from the Worker entry (`src/server.ts`) so `@cloudflare/vite-plugin`
// emits them as named module exports; `cloudflare.config.ts` declares the same
// names under `exports`.

import type { schema } from "@badag/db-schema/orchestrator-db";
import { DurableObject } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/durable-sqlite";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import { migrateTaskOrchestratorDB } from "@/integrations/db/orchestrator";
import { createDynamicWorkerEntrypoint } from "@/integrations/dynamic-worker/entrypoint";

const MIGRATED_KEY = "migrated";

interface TaskOrchestratorDoProps {
    placeholder: string;
}

export class TaskOrchestratorDO extends DurableObject<
    Env,
    TaskOrchestratorDoProps
> {
    // @ts-expect-error later
    #db: DrizzleSqliteDODatabase<typeof schema>;

    constructor(
        ctx: TaskOrchestratorDO["ctx"],
        env: TaskOrchestratorDO["env"]
    ) {
        super(ctx, env);

        this.#db = drizzle(ctx.storage);

        ctx.blockConcurrencyWhile(async () => {
            const migrated = await ctx.storage.get(MIGRATED_KEY);

            if (migrated) {
                return;
            }

            await migrateTaskOrchestratorDB(ctx.storage);
            await ctx.storage.put(MIGRATED_KEY, 1);
        });
    }
}

// One entrypoint backs every dynamic workflow run. The metadata attached at
// `create()` time carries the worker definition, so this dispatcher stays
// feature-agnostic; see `integrations/dynamic-worker`.
export const DynamicWorkflow = createDynamicWorkerEntrypoint();

export { DynamicWorkflowBinding } from "@cloudflare/dynamic-workflows";
