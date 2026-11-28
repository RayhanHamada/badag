-- Pre-release rebuild: task executions had no run linkage and cannot be
-- attributed retroactively. There is no production data to preserve.
DROP TABLE `task_executions`;
--> statement-breakpoint
CREATE TABLE `task_executions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dag_run_id` integer NOT NULL,
	`task_key` text(100) NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt` integer DEFAULT 0 NOT NULL,
	`input` text,
	`output` text,
	`error` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `task_executions_run_task_idx` ON `task_executions` (`dag_run_id`,`task_key`);--> statement-breakpoint
CREATE INDEX `task_executions_status_created_idx` ON `task_executions` (`status`,`created_at`);
