import { OpenAPIGenerator } from "@orpc/openapi";
import { ValibotToJsonSchemaConverter } from "@orpc/valibot";

import { API_ERROR_JSON_SCHEMA, API_ERROR_STATUS_MAP } from "./errors";
import { apiDefinitions } from "./models";
import { apiRouter } from "./router";
import { playgroundDefinitions } from "./routes/playground";

const generator = new OpenAPIGenerator({
    converters: [
        new ValibotToJsonSchemaConverter({
            // Registering schemas by identity turns them into
            // `components.schemas` entries referenced with `$ref` instead of
            // duplicated inline objects.
            definitions: {
                ...apiDefinitions,
                ...playgroundDefinitions,
            },
            // Procedures reuse the same schema objects and definitions are
            // recomputed per conversion; cache keeps repeated work off.
            cache: true,
        }),
    ],
});

export function generateOpenApiDocument() {
    return generator.generate(apiRouter, {
        version: "3.1.0",
        base: {
            info: {
                title: "Badag Public API",
                version: "1.0.0",
                description:
                    "HTTP API for inspecting and managing DAGs, their task executions, and schedules.",
            },
            servers: [{ url: "/api/v1", description: "Public API" }],
            tags: [
                {
                    name: "DAGs",
                    description:
                        "DAG metadata, tasks, dependency edges, and runs.",
                },
                {
                    name: "Runs",
                    description:
                        "DAG runs and the task executions inside them.",
                },
                {
                    name: "Schedules",
                    description: "Cron schedules that trigger DAG runs.",
                },
                {
                    name: "System",
                    description: "Service health.",
                },
                {
                    name: "Playground",
                    description:
                        "Per-tenant dynamic Workflow demonstration backed by the Worker Loader.",
                },
            ],
        },
        errorStatusMap: API_ERROR_STATUS_MAP,
        errorResponseBodySchema: () => API_ERROR_JSON_SCHEMA,
    });
}
