/**
 * Airflow's `validate_key` convention, shared by DAG ids and task names.
 *
 * Airflow accepts Unicode letters and numbers, underscores, dots, and dashes,
 * and caps the key at 250 characters.
 */

/** Airflow's default `validate_key` maximum length. */
export const AIRFLOW_KEY_MAX_LENGTH = 250;

/** Airflow's key pattern: letters, numbers, "_", ".", and "-". */
export const AIRFLOW_KEY_PATTERN = /^[\p{L}\p{N}_.-]+$/u;
