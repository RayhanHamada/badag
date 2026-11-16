import { implement } from "@orpc/server";

import { notImplemented } from "../shared";
import { runsContract } from "./runs.contract";

const os = implement(runsContract);

export const runsRouter = os.router({
    list: os.list.handler(notImplemented),
    get: os.get.handler(notImplemented),
    listTaskExecutions: os.listTaskExecutions.handler(notImplemented),
    getTaskExecution: os.getTaskExecution.handler(notImplemented),
    cancel: os.cancel.handler(notImplemented),
});
