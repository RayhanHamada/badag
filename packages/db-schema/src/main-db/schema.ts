import { relations, sql } from "drizzle-orm";
import {
    sqliteTable,
    int,
    text,
    index,
    uniqueIndex,
    primaryKey,
    foreignKey,
    check,
} from "drizzle-orm/sqlite-core";

import { COMMON_COLUMNS } from "../utils";
import {
    DAG_NAME_MAX_LENGTH,
    DEFAULT,
    LIST_DAG_RUN_STATUS,
    LIST_DAG_RUN_TRIGGER,
    DAG_REVISION_MAX_LENGTH,
    DAG_TASK_KEY_MAX_LENGTH,
    DAG_TASK_TYPE_MAX_LENGTH,
} from "./constants";

// Logical DAG
export const dags = sqliteTable(
    "dags",
    {
        id: int("id").primaryKey({ autoIncrement: true }),
        name: text("name", { length: DAG_NAME_MAX_LENGTH }).notNull(),
        description: text("description"),
        ...COMMON_COLUMNS,
    },
    (t) => [uniqueIndex("dags_name_idx").on(t.name)]
);

// One immutable compiled graph. The revision is the content hash from the
// graph spec; `spec` is the serialized GraphSpec it names.
export const dagRevisions = sqliteTable(
    "dag_revisions",
    {
        id: int("id").primaryKey({ autoIncrement: true }),

        dagId: int("dag_id")
            .notNull()
            .references(() => dags.id, { onDelete: "cascade" }),

        revision: text("revision", {
            length: DAG_REVISION_MAX_LENGTH,
        }).notNull(),

        spec: text("spec", { mode: "json" })
            .$type<Record<string, unknown>>()
            .notNull(),

        // Revisions are immutable; only the creation timestamp applies.
        createdAt: COMMON_COLUMNS.createdAt,
    },
    (t) => [
        uniqueIndex("dag_revisions_dag_revision_idx").on(t.dagId, t.revision),
        // Required for composite foreign keys on tasks and runs.
        uniqueIndex("dag_revisions_dag_id_id_idx").on(t.dagId, t.id),
    ]
);

// Tasks belong to one revision of a DAG. The key is the declared node key
// from the graph spec; there is no second display name.
export const dagTasks = sqliteTable(
    "dag_tasks",
    {
        id: int("id").primaryKey({ autoIncrement: true }),

        dagId: int("dag_id")
            .notNull()
            .references(() => dags.id, { onDelete: "cascade" }),

        revisionId: int("revision_id").notNull(),

        // Declared node key; stable across builds.
        key: text("key", { length: DAG_TASK_KEY_MAX_LENGTH }).notNull(),
        type: text("type", { length: DAG_TASK_TYPE_MAX_LENGTH }).notNull(),

        config: text("config", { mode: "json" })
            .$type<Record<string, unknown>>()
            .notNull()
            .default({}),

        ...COMMON_COLUMNS,
    },
    (t) => [
        uniqueIndex("dag_tasks_dag_revision_key_idx").on(
            t.dagId,
            t.revisionId,
            t.key
        ),
        // Required for composite foreign keys on graph edges.
        uniqueIndex("dag_tasks_dag_revision_id_id_idx").on(
            t.dagId,
            t.revisionId,
            t.id
        ),
        index("dag_tasks_dag_revision_type_idx").on(
            t.dagId,
            t.revisionId,
            t.type
        ),
        foreignKey({
            columns: [t.dagId, t.revisionId],
            foreignColumns: [dagRevisions.dagId, dagRevisions.id],
            name: "dag_tasks_revision_fk",
        }).onDelete("cascade"),
    ]
);

// Directed edge: fromTaskId -> toTaskId, optionally labeled with a route.
// Composite FKs ensure both tasks belong to the same DAG and revision.
export const dagEdges = sqliteTable(
    "dag_edges",
    {
        dagId: int("dag_id").notNull(),
        revisionId: int("revision_id").notNull(),
        fromTaskId: int("from_task_id").notNull(),
        toTaskId: int("to_task_id").notNull(),

        // Empty means unlabeled; a labeled and an unlabeled edge between the
        // same pair are distinct.
        label: text("label").notNull().default(""),

        // Edges are immutable; only the creation timestamp applies.
        createdAt: COMMON_COLUMNS.createdAt,
    },
    (t) => [
        primaryKey({
            columns: [t.dagId, t.revisionId, t.fromTaskId, t.toTaskId, t.label],
        }),
        foreignKey({
            columns: [t.dagId, t.revisionId, t.fromTaskId],
            foreignColumns: [dagTasks.dagId, dagTasks.revisionId, dagTasks.id],
            name: "dag_edges_from_task_fk",
        }).onDelete("cascade"),
        foreignKey({
            columns: [t.dagId, t.revisionId, t.toTaskId],
            foreignColumns: [dagTasks.dagId, dagTasks.revisionId, dagTasks.id],
            name: "dag_edges_to_task_fk",
        }).onDelete("cascade"),
        check("dag_edges_no_self_loop", sql`${t.fromTaskId} <> ${t.toTaskId}`),
        index("dag_edges_downstream_idx").on(
            t.dagId,
            t.revisionId,
            t.fromTaskId
        ),
        index("dag_edges_upstream_idx").on(t.dagId, t.revisionId, t.toTaskId),
    ]
);

// One record per execution of a DAG revision.
export const dagRuns = sqliteTable(
    "dag_runs",
    {
        id: int("id").primaryKey({ autoIncrement: true }),

        dagId: int("dag_id")
            .notNull()
            .references(() => dags.id),

        // Nullable for rows created before revisions existed.
        revisionId: int("revision_id").references(() => dagRevisions.id, {
            onDelete: "set null",
        }),

        status: text("status", { enum: LIST_DAG_RUN_STATUS })
            .notNull()
            .default(DEFAULT.DAG_RUN_STATUS),

        triggerType: text("trigger_type", { enum: LIST_DAG_RUN_TRIGGER })
            .notNull()
            .default(DEFAULT.DAG_RUN_TRIGGER),

        // Optional idempotency key or scheduler-generated run key.
        runKey: text("run_key"),

        input: text("input", { mode: "json" }).$type<Record<string, unknown>>(),

        output: text("output", { mode: "json" }).$type<
            Record<string, unknown>
        >(),

        startedAt: int("started_at", { mode: "timestamp_ms" }),
        finishedAt: int("finished_at", { mode: "timestamp_ms" }),

        ...COMMON_COLUMNS,
    },
    (t) => [
        uniqueIndex("dag_runs_run_key_idx").on(t.dagId, t.runKey),
        index("dag_runs_status_created_idx").on(t.status, t.createdAt),
        index("dag_runs_dag_created_idx").on(t.dagId, t.createdAt),
        index("dag_runs_revision_idx").on(t.revisionId),
    ]
);

// Relational query metadata. `task_id` is a globally unique primary key, so a
// relation on that column alone is exact even though the graph edges are
// enforced by the composite `(dag_id, revision_id, task_id)` foreign keys.
export const dagsRelations = relations(dags, ({ many }) => ({
    revisions: many(dagRevisions),
    tasks: many(dagTasks),
    runs: many(dagRuns),
}));

export const dagRevisionsRelations = relations(
    dagRevisions,
    ({ one, many }) => ({
        dag: one(dags, {
            fields: [dagRevisions.dagId],
            references: [dags.id],
        }),
        tasks: many(dagTasks),
        runs: many(dagRuns),
    })
);

export const dagTasksRelations = relations(dagTasks, ({ one, many }) => ({
    dag: one(dags, {
        fields: [dagTasks.dagId],
        references: [dags.id],
    }),
    revision: one(dagRevisions, {
        fields: [dagTasks.revisionId],
        references: [dagRevisions.id],
    }),
    outgoingEdges: many(dagEdges, { relationName: "dag_edges_from_task" }),
    incomingEdges: many(dagEdges, { relationName: "dag_edges_to_task" }),
}));

export const dagEdgesRelations = relations(dagEdges, ({ one }) => ({
    dag: one(dags, {
        fields: [dagEdges.dagId],
        references: [dags.id],
    }),
    revision: one(dagRevisions, {
        fields: [dagEdges.revisionId],
        references: [dagRevisions.id],
    }),
    fromTask: one(dagTasks, {
        fields: [dagEdges.fromTaskId],
        references: [dagTasks.id],
        relationName: "dag_edges_from_task",
    }),
    toTask: one(dagTasks, {
        fields: [dagEdges.toTaskId],
        references: [dagTasks.id],
        relationName: "dag_edges_to_task",
    }),
}));

export const dagRunsRelations = relations(dagRuns, ({ one }) => ({
    dag: one(dags, {
        fields: [dagRuns.dagId],
        references: [dags.id],
    }),
    revision: one(dagRevisions, {
        fields: [dagRuns.revisionId],
        references: [dagRevisions.id],
    }),
}));
