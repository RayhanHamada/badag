import "@orpc/openapi/extensions/route";
import { oc } from "@orpc/contract";

// Shared contract builder for every public API procedure. The route extension
// adds `.route()` for OpenAPI metadata; `.errors` documents the validation
// response that input validation adds to every procedure.
export const base = oc.errors({
    BAD_REQUEST: { message: "Invalid request." },
});
