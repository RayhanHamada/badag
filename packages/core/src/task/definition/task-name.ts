import { AIRFLOW_KEY_MAX_LENGTH, AIRFLOW_KEY_PATTERN } from "../../airflow-key";
import type { TrimTaskName } from "../types/base";

/**
 * Task names follow Airflow's `task_id` convention.
 *
 * Airflow's `validate_key` accepts Unicode word characters, dots, and dashes,
 * and caps the key at 250 characters.
 */

/** The problem with an already-trimmed task name, or `undefined` if valid. */
export function taskNameError(name: string): string | undefined {
    if (!name.trim()) {
        return "Task name cannot be empty";
    }

    if (name.length > AIRFLOW_KEY_MAX_LENGTH) {
        return `Task name "${name}" must be at most ${AIRFLOW_KEY_MAX_LENGTH} characters`;
    }

    if (!AIRFLOW_KEY_PATTERN.test(name)) {
        return `Task name "${name}" must use letters, numbers, ".", "-", or "_"`;
    }

    return undefined;
}

/** Whether an already-trimmed name follows Airflow's task name convention. */
export function isTaskName(name: string): boolean {
    return taskNameError(name) === undefined;
}

/** Validate an already-trimmed task name. */
export function assertTaskName(name: string): void {
    const error = taskNameError(name);

    if (error !== undefined) {
        throw new Error(error);
    }
}

/**
 * Trim surrounding whitespace and validate a task name.
 *
 * The trimmed name follows Airflow's `task_id` convention: Unicode letters and
 * numbers, underscores, dots, and dashes, at most 250 characters.
 */
export function normalizeTaskName<Name extends string>(
    name: Name
): TrimTaskName<Name> {
    const trimmed = name.trim();

    assertTaskName(trimmed);

    // SAFETY: trim() removes the whitespace represented by TrimTaskName.
    return trimmed as TrimTaskName<Name>;
}
