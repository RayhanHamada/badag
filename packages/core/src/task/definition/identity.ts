import { TASK_KIND_ENUM } from "../kind";
import type { AnyTaskDefinition } from "../types/definitions";

/** Whether two optional branch sets declare the same names in the same order. */
function sameBranchSet(
    left: readonly string[] | undefined,
    right: readonly string[] | undefined
): boolean {
    if (left === right) {
        return true;
    }

    if (left === undefined || right === undefined) {
        return false;
    }

    return (
        left.length === right.length &&
        left.every((name, index) => name === right[index])
    );
}

/**
 * Whether two definitions with the same task id describe the same behavior.
 *
 * Callback kinds compare callback references, so captured values count.
 * Declarative kinds compare the fields that determine what they do. Metadata
 * is ignored: a duplicate registration keeps the first definition's metadata.
 */
export function sameTaskBehavior(
    left: AnyTaskDefinition,
    right: AnyTaskDefinition
): boolean {
    switch (left.kind) {
        case TASK_KIND_ENUM.Task: {
            return right.kind === TASK_KIND_ENUM.Task && left.fn === right.fn;
        }

        case TASK_KIND_ENUM.Sensor: {
            return (
                right.kind === TASK_KIND_ENUM.Sensor &&
                left.predicate === right.predicate
            );
        }

        case TASK_KIND_ENUM.Delay: {
            return (
                right.kind === TASK_KIND_ENUM.Delay &&
                left.durationMs === right.durationMs
            );
        }

        case TASK_KIND_ENUM.Branch: {
            return (
                right.kind === TASK_KIND_ENUM.Branch &&
                left.choose === right.choose &&
                sameBranchSet(left.branches, right.branches)
            );
        }

        case TASK_KIND_ENUM.ShortCircuit: {
            return (
                right.kind === TASK_KIND_ENUM.ShortCircuit &&
                left.condition === right.condition
            );
        }

        case TASK_KIND_ENUM.Trigger: {
            return (
                right.kind === TASK_KIND_ENUM.Trigger &&
                left.dagId === right.dagId &&
                left.waitForCompletion === right.waitForCompletion
            );
        }

        default: {
            const exhaustiveCheck: never = left;

            return exhaustiveCheck;
        }
    }
}
