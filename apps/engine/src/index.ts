import { handlePublicApiRequest } from "@/integrations/orpc/app";

// Durable Object and Workflow classes re-exported so the Cloudflare Vite
// plugin emits them as named module exports; `cloudflare.config.ts` declares
// the same names under `exports`.
export * from "@/integrations/exports";

const API_PREFIX = "/api/v1";

// The engine is a plain Worker: every HTTP route lives under the public API
// prefix, and the exported Durable Object / Workflow classes are reached by
// their bindings, not by `fetch`.
export default {
    fetch(request: Request): Promise<Response> {
        const { pathname } = new URL(request.url);

        if (pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`)) {
            return handlePublicApiRequest(request);
        }

        return Promise.resolve(
            Response.json(
                {
                    code: "not_found",
                    message: "No route matches this request.",
                },
                { status: 404 }
            )
        );
    },
} satisfies ExportedHandler<Env>;
