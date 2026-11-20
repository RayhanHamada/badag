/**
 * A Standard Schema fixture for type tests.
 *
 * The API never applies a schema, so tests only need the declared type; this
 * returns the value unchanged.
 */

import type { StandardSchemaV1 } from "@standard-schema/spec";

export function schema<Value>(): StandardSchemaV1<Value, Value> {
    return {
        "~standard": {
            version: 1,
            vendor: "badag-test",
            validate: (value) => ({
                // SAFETY: the fixture stands in for validation; the declared
                // type argument is the contract being tested.
                value: value as Value,
            }),
        },
    };
}
