import { AIRFLOW_KEY_MAX_LENGTH, AIRFLOW_KEY_PATTERN } from "../airflow-key";

/**
 * DAG ids follow Airflow's `dag_id` convention.
 *
 * Airflow's `validate_key` accepts Unicode word characters, dots, and dashes,
 * and caps the id at 250 characters. Ids are not trimmed: whitespace, other
 * punctuation, and ids longer than 250 characters are invalid under the
 * convention, exactly as Airflow treats them.
 */

/** The problem with a DAG id, or `undefined` if valid. */
export function dagIdError(dagId: string): string | undefined {
    if (!dagId.trim()) {
        return "DAG id cannot be empty";
    }

    if (dagId.length > AIRFLOW_KEY_MAX_LENGTH) {
        return `DAG id "${dagId}" must be at most ${AIRFLOW_KEY_MAX_LENGTH} characters`;
    }

    if (!AIRFLOW_KEY_PATTERN.test(dagId)) {
        return `DAG id "${dagId}" must use letters, numbers, ".", "-", or "_"`;
    }

    return undefined;
}
