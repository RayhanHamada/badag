import { implement } from "@orpc/server";

import { notImplemented } from "../shared";
import { dagsContract } from "./dags.contract";

const os = implement(dagsContract);

export const dagsRouter = os.router({
    list: os.list.handler(notImplemented),
    create: os.create.handler(notImplemented),
    get: os.get.handler(notImplemented),
    update: os.update.handler(notImplemented),
    delete: os.delete.handler(notImplemented),
    listTasks: os.listTasks.handler(notImplemented),
    registerTasks: os.registerTasks.handler(notImplemented),
    listEdges: os.listEdges.handler(notImplemented),
    createEdge: os.createEdge.handler(notImplemented),
    listRuns: os.listRuns.handler(notImplemented),
    triggerRun: os.triggerRun.handler(notImplemented),
});
