/**
 * Optional-field normalization shared by task definitions and JSON snapshots.
 */

/**
 * Remove every entry whose value is `undefined` from a freshly built object.
 *
 * Callers pass an object literal they just built, so the object is private and
 * deleting from it in place allocates nothing extra. Property order is kept,
 * so definitions and snapshots read in the same order as the literal.
 */
export function definedFields<Value extends object>(value: Value): Value {
    // SAFETY: every call site passes a plain object literal, so the value can be
    // viewed as an open record to inspect the property values.
    const fields = value as Record<string, unknown>;

    for (const key of Object.keys(fields)) {
        if (fields[key] === undefined) {
            // The keys belong to a private literal, so deleting the undefined
            // entries keeps definitions compact without copying the object.
            // oxlint-disable-next-line typescript/no-dynamic-delete
            delete fields[key];
        }
    }

    return value;
}
