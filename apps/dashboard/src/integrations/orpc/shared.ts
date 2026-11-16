import { ORPCError } from "@orpc/server";

import { NOT_IMPLEMENTED_MESSAGE } from "./errors";

// Stub handlers throw this until the corresponding data access and
// orchestration logic lands. The error map on each procedure documents the
// resulting 501 response.
export const notImplemented = (): never => {
    throw new ORPCError("NOT_IMPLEMENTED", {
        message: NOT_IMPLEMENTED_MESSAGE,
    });
};
