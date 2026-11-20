import { index, int, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { COMMON_COLUMNS } from "../utils";
import {
    DEFAULT,
    LIST_TASK_EXECUTION_STATUS,
    TASK_KEY_MAX_LENGTH,
} from "./constants";

// One record per task execution in a DAG run.
//
// This database is separate from `main-db`, where runs and graph rows live.
// SQLite cannot enforce a foreign key across databases, so `dag_run_id` and
// `task_key` are references by value: the orchestrator owns consistency, and
// the run id is not a foreign key. `task_key` is the declared node key from
// the graph spec, which is stable across builds.
export const taskExecutions = sqliteTable(
    "task_executions",
    {
        id: int("id").primaryKey({ autoIncrement: true }),

        dagRunId: int("dag_run_id").notNull(),

        taskKey: text("task_key", { length: TASK_KEY_MAX_LENGTH }).notNull(),

        status: text("status", { enum: LIST_TASK_EXECUTION_STATUS })
            .notNull()
            .default(DEFAULT.TASK_EXECUTION_STATUS),

        attempt: int("attempt").notNull().default(0),

        input: text("input", { mode: "json" }).$type<Record<string, unknown>>(),

        output: text("output", {
            mode: "json",
        }).$type<Record<string, unknown>>(),

        error: text("error"),

        startedAt: int("started_at", { mode: "timestamp_ms" }),
        finishedAt: int("finished_at", { mode: "timestamp_ms" }),

        ...COMMON_COLUMNS,
    },
    (t) => [
        index("task_executions_run_task_idx").on(t.dagRunId, t.taskKey),
        index("task_executions_status_created_idx").on(t.status, t.createdAt),
    ]
);
