import { base } from "../base";
import { healthSchema } from "../models";

export const systemContract = {
    health: base
        .route({
            method: "GET",
            path: "/health",
            tags: ["System"],
            summary: "API health",
            description: "Returns `ok` when the public API is reachable.",
            successDescription: "Service is healthy.",
        })
        .output(healthSchema),
};
