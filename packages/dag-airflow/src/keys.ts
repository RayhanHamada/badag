/**
 * Identifier conventions the dialect enforces.
 *
 * Airflow's `validate_key` applies to DAG ids and node keys: Unicode letters
 * and numbers, underscore, dot, and dash, at most 250 characters. Route labels
 * are not node keys, so they only have to be present and not whitespace.
 */

/** Airflow's default `validate_key` maximum length. */
export const AIRFLOW_KEY_MAX_LENGTH = 250;

/** Airflow's key pattern: letters, numbers, "_", ".", and "-". */
// oxlint-disable-next-line typescript/no-inferrable-types -- isolatedDeclarations requires the annotation
export const AIRFLOW_KEY_PATTERN: RegExp = /^[\p{L}\p{N}_.-]+$/u;

/**
 * The problem with a key, or `undefined` when it follows the convention.
 *
 * `label` names the value in the message ("DAG id", "Node key"). Keys are
 * matched as given, so callers that trim must do so before calling.
 */
export function airflowKeyError(
    label: string,
    value: string
): string | undefined {
    if (value.trim() === "") {
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

/** Whether a value follows Airflow's `validate_key` convention. */
export function isAirflowKey(value: string): boolean {
    return airflowKeyError("Key", value) === undefined;
}

/** Validate a value against Airflow's `validate_key` convention. */
export function assertAirflowKey(label: string, value: string): void {
    const error = airflowKeyError(label, value);

    if (error !== undefined) {
        throw new Error(error);
    }
}

/**
 * Validate a route label.
 *
 * A route label names a selection, not a node, so it need not follow the key
 * convention; it only has to be a non-empty, non-whitespace string.
 */
export function assertRouteLabel(label: string): void {
    if (label.trim() === "") {
        throw new Error("Route label cannot be empty");
    }
}
