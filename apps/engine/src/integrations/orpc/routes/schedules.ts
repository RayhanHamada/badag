import { implement } from "@orpc/server";

import { notImplemented } from "../shared";
import { schedulesContract } from "./schedules.contract";

const os = implement(schedulesContract);

export const schedulesRouter = os.router({
    list: os.list.handler(notImplemented),
    get: os.get.handler(notImplemented),
    upsert: os.upsert.handler(notImplemented),
    delete: os.delete.handler(notImplemented),
});
