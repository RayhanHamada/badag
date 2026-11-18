import { implement } from "@orpc/server";

import { systemContract } from "./system.contract";

const os = implement(systemContract);

export const systemRouter = os.router({
    health: os.health.handler(() => ({ status: "ok" as const })),
});
