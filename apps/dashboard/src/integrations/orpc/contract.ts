import { dagsContract } from "./routes/dags.contract";
import { playgroundContract } from "./routes/playground.contract";
import { runsContract } from "./routes/runs.contract";
import { schedulesContract } from "./routes/schedules.contract";
import { systemContract } from "./routes/system.contract";

// Contract-only router: it carries routing metadata, schemas, and errors but no
// handlers, so the spec generator and clients can import it without pulling in
// implementation code. URL paths come from each procedure's OpenAPI metadata,
// so the keys are only namespaces.
export const apiContract = {
    system: systemContract,
    dags: dagsContract,
    runs: runsContract,
    schedules: schedulesContract,
    playground: playgroundContract,
} as const;
