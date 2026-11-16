import "@orpc/openapi/extensions/route";
import { os } from "@orpc/server";

// Shared builder for every public API procedure. The route extension adds
// `.route()` for OpenAPI metadata; `.errors` documents the validation response
// that input validation adds to every procedure.
export const base = os.errors({
    BAD_REQUEST: { message: "Invalid request." },
});
