import { createFileRoute } from "@tanstack/react-router";

import { PlaygroundPage } from "@/features/playground/components/playground-page";

export const Route = createFileRoute("/_dashboard/playground")({
    head: () => ({
        meta: [
            { title: "Playground · Badag" },
            {
                name: "description",
                content:
                    "Run per-tenant Cloudflare dynamic workflows and inspect their generated modules.",
            },
        ],
    }),
    component: PlaygroundPage,
});
