import { base } from "../base";
import { healthSchema } from "../models";

export const systemRouter = {
    health: base
        .route({
            method: "GET",
            path: "/health",
            tags: ["System"],
            summary: "API health",
            description: "Returns `ok` when the public API is reachable.",
            successDescription: "Service is healthy.",
        })
        .output(healthSchema)
        .handler(() => ({ status: "ok" as const })),
};
