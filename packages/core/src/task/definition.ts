/**
 * Definition assembly shared by the task factories.
 *
 * A definition carries the metadata every kind accepts plus the schemas it
 * declares. Optional fields are omitted rather than written as `undefined`, so
 * definitions and JSON snapshots stay compact.
 */

import { definedFields } from "../fields";
import type { AnySchema, TaskMetadata, TaskSchemas } from "./base";
import type { TriggerRule } from "./trigger-rule";
import { DEFAULT_TRIGGER_RULE } from "./trigger-rule";

/**
 * Normalize the metadata shared by every task factory.
 */
export function taskMetadata(
    metadata: Pick<TaskMetadata, "description" | "config" | "triggerRule">
): TaskMetadata & { readonly triggerRule: TriggerRule } {
    return definedFields({
        triggerRule: metadata.triggerRule ?? DEFAULT_TRIGGER_RULE,
        description: metadata.description,
        config: metadata.config,
    });
}

/**
 * Normalize the schemas declared by a task factory.
 *
 * The declared schema types are preserved, so a definition keeps its inferred
 * payload and result.
 */
export function taskSchemas<Input extends AnySchema, Output extends AnySchema>(
    schemas: TaskSchemas<Input, Output>
): TaskSchemas<Input, Output> {
    return definedFields({ input: schemas.input, output: schemas.output });
}
