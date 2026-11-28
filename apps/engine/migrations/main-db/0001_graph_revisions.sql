-- Pre-release rebuild: revision-scoped graphs did not exist before this
-- migration, so existing graph rows have no revision to belong to. The
-- databases hold no production data; this migration recreates the tables.
PRAGMA defer_foreign_keys = ON;
--> statement-breakpoint
DROP TABLE `dag_edges`;
--> statement-breakpoint
DROP TABLE `dag_tasks`;
--> statement-breakpoint
DROP TABLE `dag_runs`;
--> statement-breakpoint
CREATE TABLE `dag_revisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dag_id` integer NOT NULL,
	`revision` text(64) NOT NULL,
	`spec` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`dag_id`) REFERENCES `dags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dag_revisions_dag_revision_idx` ON `dag_revisions` (`dag_id`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `dag_revisions_dag_id_id_idx` ON `dag_revisions` (`dag_id`,`id`);--> statement-breakpoint
CREATE TABLE `dag_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dag_id` integer NOT NULL,
	`revision_id` integer NOT NULL,
	`key` text(100) NOT NULL,
	`type` text(50) NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`dag_id`) REFERENCES `dags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dag_id`,`revision_id`) REFERENCES `dag_revisions`(`dag_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dag_tasks_dag_revision_key_idx` ON `dag_tasks` (`dag_id`,`revision_id`,`key`);--> statement-breakpoint
CREATE UNIQUE INDEX `dag_tasks_dag_revision_id_id_idx` ON `dag_tasks` (`dag_id`,`revision_id`,`id`);--> statement-breakpoint
CREATE INDEX `dag_tasks_dag_revision_type_idx` ON `dag_tasks` (`dag_id`,`revision_id`,`type`);--> statement-breakpoint
CREATE TABLE `dag_edges` (
	`dag_id` integer NOT NULL,
	`revision_id` integer NOT NULL,
	`from_task_id` integer NOT NULL,
	`to_task_id` integer NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`dag_id`, `revision_id`, `from_task_id`, `to_task_id`, `label`),
	FOREIGN KEY (`dag_id`,`revision_id`,`from_task_id`) REFERENCES `dag_tasks`(`dag_id`,`revision_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dag_id`,`revision_id`,`to_task_id`) REFERENCES `dag_tasks`(`dag_id`,`revision_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "dag_edges_no_self_loop" CHECK("dag_edges"."from_task_id" <> "dag_edges"."to_task_id")
);
--> statement-breakpoint
CREATE INDEX `dag_edges_downstream_idx` ON `dag_edges` (`dag_id`,`revision_id`,`from_task_id`);--> statement-breakpoint
CREATE INDEX `dag_edges_upstream_idx` ON `dag_edges` (`dag_id`,`revision_id`,`to_task_id`);--> statement-breakpoint
CREATE TABLE `dag_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dag_id` integer NOT NULL,
	`revision_id` integer,
	`status` text DEFAULT 'running' NOT NULL,
	`trigger_type` text DEFAULT 'manual' NOT NULL,
	`run_key` text,
	`input` text,
	`output` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`dag_id`) REFERENCES `dags`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`revision_id`) REFERENCES `dag_revisions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dag_runs_run_key_idx` ON `dag_runs` (`dag_id`,`run_key`);--> statement-breakpoint
CREATE INDEX `dag_runs_status_created_idx` ON `dag_runs` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `dag_runs_dag_created_idx` ON `dag_runs` (`dag_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `dag_runs_revision_idx` ON `dag_runs` (`revision_id`);
