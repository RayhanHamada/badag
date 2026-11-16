import { dagsRouter } from "./routes/dags";
import { playgroundRouter } from "./routes/playground";
import { runsRouter } from "./routes/runs";
import { schedulesRouter } from "./routes/schedules";
import { systemRouter } from "./routes/system";

// URL paths come from each procedure's OpenAPI metadata, so router keys are
// only namespaces. Keeping them grouped makes the generated spec readable.
export const apiRouter = {
    system: systemRouter,
    dags: dagsRouter,
    runs: runsRouter,
    schedules: schedulesRouter,
    playground: playgroundRouter,
} as const;
