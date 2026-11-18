import { COMMON_ERROR_STATUS_MAP } from "@orpc/openapi";
import { error } from "@orpc/server";
import type { AnyORPCError, ErrorMap } from "@orpc/server";
import { ValibotToJsonSchemaConverter } from "@orpc/valibot";
import * as v from "valibot";

import { apiErrorSchema } from "./models";

const NOT_IMPLEMENTED_MESSAGE =
    "This endpoint is part of the public API contract but is not implemented yet.";

// Reusable typesafe error for stub handlers that cannot access the per-handler
// `errors` constructors.
export const NotImplementedError = error("NOT_IMPLEMENTED", {
    message: NOT_IMPLEMENTED_MESSAGE,
});

// Messages documented per procedure through `.errors()`.
export const NOT_IMPLEMENTED_ERROR_MAP = {
    NOT_IMPLEMENTED: NotImplementedError,
} satisfies ErrorMap;

export const NOT_FOUND_ERROR_MAP = {
    NOT_FOUND: { message: "Resource not found." },
} satisfies ErrorMap;

export const TENANT_ERROR_MAP = {
    TENANT_ERROR: {
        message: "The tenant worker could not start the workflow.",
    },
} satisfies ErrorMap;

// Shared by the handler (wire encoding) and the generator (documentation) so
// the published contract matches what clients actually receive.
export const API_ERROR_STATUS_MAP = {
    ...COMMON_ERROR_STATUS_MAP,
    BAD_REQUEST: 422,
    TENANT_ERROR: 502,
} as const;

// Generated from the same Valibot schema registered as `ApiError`, so the
// documented error body (including descriptions) cannot drift from the model.
const jsonSchemaConverter = new ValibotToJsonSchemaConverter();

export const [API_ERROR_JSON_SCHEMA] = jsonSchemaConverter.convert(
    apiErrorSchema,
    "output"
);

// oRPC attaches the Standard Schema issues to `BAD_REQUEST` errors.
const BAD_REQUEST_DATA_SCHEMA = v.object({
    issues: v.array(v.object({ message: v.string() })),
});

// Validation failures surface as the compact `{ code, message }` body; oRPC
// reports them as `BAD_REQUEST`, so fold the issue messages into one line.
export function encodeApiError(orpcError: AnyORPCError) {
    if (orpcError.code !== "BAD_REQUEST") {
        return {
            code: orpcError.code.toLowerCase(),
            message: orpcError.message,
        };
    }

    const parsed = v.safeParse(BAD_REQUEST_DATA_SCHEMA, orpcError.data);
    const issues = parsed.success ? parsed.output.issues : [];

    return {
        code: "invalid_request",
        message:
            issues.length > 0
                ? issues.map((issue) => issue.message).join("; ")
                : orpcError.message,
    };
}
