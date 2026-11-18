import { AIRFLOW_KEY_MAX_LENGTH, AIRFLOW_KEY_PATTERN } from "../../airflow-key";
import type { TrimTaskId } from "../types/base";

/**
 * Task ids follow Airflow's `task_id` convention.
 *
 * Airflow's `validate_key` accepts Unicode word characters, dots, and dashes,
 * and caps the key at 250 characters.
 */

/** The problem with an already-trimmed task id, or `undefined` if valid. */
export function taskIdError(id: string): string | undefined {
    if (!id.trim()) {
        return "Task ID cannot be empty";
    }

    if (id.length > AIRFLOW_KEY_MAX_LENGTH) {
        return `Task ID "${id}" must be at most ${AIRFLOW_KEY_MAX_LENGTH} characters`;
    }

    if (!AIRFLOW_KEY_PATTERN.test(id)) {
        return `Task ID "${id}" must use letters, numbers, ".", "-", or "_"`;
    }

    return undefined;
}

/** Whether an already-trimmed id follows Airflow's task id convention. */
export function isTaskId(id: string): boolean {
    return taskIdError(id) === undefined;
}

/** Validate an already-trimmed task id. */
export function assertTaskId(id: string): void {
    const error = taskIdError(id);

    if (error !== undefined) {
        throw new Error(error);
    }
}

/**
 * Trim surrounding whitespace and validate a task id.
 *
 * The trimmed id follows Airflow's `task_id` convention: Unicode letters and
 * numbers, underscores, dots, and dashes, at most 250 characters.
 */
export function normalizeTaskId<Id extends string>(id: Id): TrimTaskId<Id> {
    const trimmed = id.trim();

    assertTaskId(trimmed);

    // SAFETY: trim() removes the whitespace represented by TrimTaskId.
    return trimmed as TrimTaskId<Id>;
}
