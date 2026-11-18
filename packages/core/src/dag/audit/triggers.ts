/** Audit trigger tasks that target their own DAG. */

import { TASK_KIND_ENUM } from "../../task/kind";
import type { DAGTask } from "../registered-task";
import { DAG_VIOLATION_ENUM } from "./violation";
import type { DAGViolation } from "./violation";

/**
 * Report trigger tasks that start the DAG containing them.
 *
 * A trigger task points at a target DAG, so a task targeting its own DAG starts
 * a copy of itself; the SDK does not run DAGs, but no scheduler can execute
 * that request. The target id is compared after trimming, while the
 * containing DAG id is validated without surrounding whitespace.
 */
export function findTriggerViolations(
    dagId: string,
    tasks: readonly DAGTask[]
): DAGViolation[] {
    const violations: DAGViolation[] = [];
    const target = dagId.trim();

    for (const task of tasks) {
        const { definition } = task;

        if (definition.kind !== TASK_KIND_ENUM.Trigger) {
            continue;
        }

        if (definition.dagId.trim() === target) {
            violations.push({
                code: DAG_VIOLATION_ENUM.SelfTrigger,
                message: `Trigger task "${task.id}" starts DAG "${target}", which contains it`,
                subjects: [task.id, target],
            });
        }
    }

    return violations;
}
