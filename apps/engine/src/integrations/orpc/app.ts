import { SmartCoercionHandlerPlugin } from "@orpc/json-schema";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferenceHandlerPlugin } from "@orpc/openapi/plugins";
import { ValibotToJsonSchemaConverter } from "@orpc/valibot";

import { API_ERROR_STATUS_MAP, encodeApiError } from "./errors";
import { apiRouter } from "./router";
import { generateOpenApiDocument } from "./spec";

const API_PREFIX = "/api/v1";

// Path and query values arrive as strings; coerce them to the types the
// Valibot schemas declare before validation runs.
const coercion = new SmartCoercionHandlerPlugin({
    converters: [new ValibotToJsonSchemaConverter()],
});

const docs = new OpenAPIReferenceHandlerPlugin({
    provider: "scalar",
    spec: () => generateOpenApiDocument(),
    docsPath: "/docs",
    specPath: "/docs/json",
    docsTitle: "Badag Public API",
});

const handler = new OpenAPIHandler(apiRouter, {
    // Error handling is shared with the generator so the documented error
    // body matches the wire format.
    errorStatusMap: API_ERROR_STATUS_MAP,
    errorResponseBodyEncoder: encodeApiError,
    plugins: [coercion, docs],
});

export async function handlePublicApiRequest(
    request: Request
): Promise<Response> {
    const { matched, response } = await handler.handle(request, {
        prefix: API_PREFIX,
    });

    if (matched && response) {
        return response;
    }

    return Response.json(
        { code: "not_found", message: "No route matches this request." },
        { status: 404 }
    );
}
