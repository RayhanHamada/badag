import "@orpc/openapi/extensions/route";
import { os } from "@orpc/server";

import { INPUT_ERROR_MAP } from "./errors";

// Shared builder for every public API procedure. The route extension above
// adds `.route()` for OpenAPI metadata, and the error map documents the
// validation response once for the whole API.
export const base = os.errors(INPUT_ERROR_MAP);
