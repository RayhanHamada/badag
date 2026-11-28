import { implement } from "@orpc/server";

import { apiContract } from "./contract";
import { dagsRouter } from "./routes/dags";
import { runsRouter } from "./routes/runs";
import { schedulesRouter } from "./routes/schedules";
import { systemRouter } from "./routes/system";

const os = implement(apiContract);

export const apiRouter = os.router({
    system: systemRouter,
    dags: dagsRouter,
    runs: runsRouter,
    schedules: schedulesRouter,
});
