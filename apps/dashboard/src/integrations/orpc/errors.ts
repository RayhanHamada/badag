import type { JsonSchema } from "@orpc/json-schema";
import { COMMON_ERROR_STATUS_MAP } from "@orpc/openapi";
import type { AnyORPCError } from "@orpc/server";
import * as v from "valibot";

export const NOT_IMPLEMENTED_MESSAGE =
    "This endpoint is part of the public API contract but is not implemented yet.";

// Documented on every procedure through the shared builder.
export const INPUT_ERROR_MAP = {
    BAD_REQUEST: { message: "Invalid request." },
} as const;

export const NOT_IMPLEMENTED_ERROR_MAP = {
    NOT_IMPLEMENTED: { message: NOT_IMPLEMENTED_MESSAGE },
} as const;

export const NOT_FOUND_ERROR_MAP = {
    NOT_FOUND: { message: "Resource not found." },
} as const;

export const TENANT_ERROR_MAP = {
    TENANT_ERROR: {
        message: "The tenant worker could not start the workflow.",
    },
} as const;

// Shared by the handler (wire encoding) and the generator (documentation) so
// the published contract matches what clients actually receive.
export const API_ERROR_STATUS_MAP = {
    ...COMMON_ERROR_STATUS_MAP,
    BAD_REQUEST: 422,
    TENANT_ERROR: 502,
} as const;

export const API_ERROR_JSON_SCHEMA: JsonSchema = {
    type: "object",
    properties: {
        code: {
            type: "string",
            description: "Machine-readable error code.",
        },
        message: {
            type: "string",
            description: "Human-readable error message.",
        },
    },
    required: ["code", "message"],
};

// oRPC attaches the Standard Schema issues to `BAD_REQUEST` errors; parse the
// documented shape before reading it.
const BAD_REQUEST_DATA_SCHEMA = v.object({
    issues: v.array(v.object({ message: v.string() })),
});

function validationMessage(error: AnyORPCError): string | undefined {
    const parsed = v.safeParse(BAD_REQUEST_DATA_SCHEMA, error.data);

    if (!parsed.success || parsed.output.issues.length === 0) {
        return undefined;
    }

    return parsed.output.issues.map((issue) => issue.message).join("; ");
}

// oRPC reports schema failures as `BAD_REQUEST`; surface them as the compact
// `{ code, message }` body the API has always returned.
export function encodeApiError(error: AnyORPCError) {
    if (error.code === "BAD_REQUEST") {
        return {
            code: "invalid_request",
            message: validationMessage(error) ?? error.message,
        };
    }

    return { code: error.code.toLowerCase(), message: error.message };
}
