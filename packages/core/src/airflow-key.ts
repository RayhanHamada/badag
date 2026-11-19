/**
 * Airflow's `validate_key` convention, shared by DAG ids and task ids.
 *
 * Airflow accepts Unicode letters and numbers, underscores, dots, and dashes,
 * and caps the key at 250 characters.
 */

/** Airflow's default `validate_key` maximum length. */
export const AIRFLOW_KEY_MAX_LENGTH = 250;

/** Airflow's key pattern: letters, numbers, "_", ".", and "-". */
export const AIRFLOW_KEY_PATTERN = /^[\p{L}\p{N}_.-]+$/u;

/**
 * The problem with a key, or `undefined` when it follows the convention.
 *
 * `label` names the value in the message ("DAG id", "Task ID"). Keys are
 * matched as given, so callers that trim must do so before calling.
 */
export function keyError(label: string, value: string): string | undefined {
    if (!value.trim()) {
        return `${label} cannot be empty`;
    }

    if (value.length > AIRFLOW_KEY_MAX_LENGTH) {
        return `${label} "${value}" must be at most ${AIRFLOW_KEY_MAX_LENGTH} characters`;
    }

    if (!AIRFLOW_KEY_PATTERN.test(value)) {
        return `${label} "${value}" must use letters, numbers, ".", "-", or "_"`;
    }

    return undefined;
}
