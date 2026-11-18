/** Audit branch declarations against the tasks they route to. */

import { isTaskId } from "../../task/definition/task-id";
import { declaredBranches } from "../declared-branches";
import { quoteValues } from "../format";
import type { DAGTask } from "../registered-task";
import { DAG_VIOLATION_ENUM } from "./violation";
import type { DAGViolation } from "./violation";

/**
 * Report branch tasks whose wiring disagrees with their declared branches.
 *
 * Only registered downstream tasks count: an edge to a task in another DAG is
 * a foreign-edge finding, not a routing one. A branch that declares no
 * branches at all is unconstrained and never reported.
 */
export function findBranchViolations(
    tasks: readonly DAGTask[],
    registered: ReadonlySet<DAGTask>
): DAGViolation[] {
    const violations: DAGViolation[] = [];

    for (const task of tasks) {
        const declared = declaredBranches(task);

        if (declared === undefined || declared.length === 0) {
            continue;
        }

        const routed = [...task.downstream].flatMap((downstream) =>
            registered.has(downstream) ? [downstream.id] : []
        );

        // One finding per branch name, so a repeated declaration is reported
        // once and a name that can never be routed to is not also reported as
        // merely unrouted.
        for (const name of new Set(declared)) {
            if (!isTaskId(name)) {
                violations.push({
                    code: DAG_VIOLATION_ENUM.InvalidDeclaredBranch,
                    message: `Branch "${task.id}" declares "${name}", which is not a valid task id`,
                    subjects: [task.id, name],
                });
                continue;
            }

            if (declared.indexOf(name) !== declared.lastIndexOf(name)) {
                violations.push({
                    code: DAG_VIOLATION_ENUM.DuplicateDeclaredBranch,
                    message: `Branch "${task.id}" declares "${name}" more than once`,
                    subjects: [task.id, name],
                });
                continue;
            }

            if (!routed.includes(name)) {
                violations.push({
                    code: DAG_VIOLATION_ENUM.UnroutedBranch,
                    message: `Branch "${task.id}" must route to declared branch "${name}"`,
                    subjects: [task.id, name],
                });
            }
        }

        for (const name of new Set(routed)) {
            if (!declared.includes(name)) {
                violations.push({
                    code: DAG_VIOLATION_ENUM.UndeclaredBranchTarget,
                    message: `Branch "${task.id}" cannot route to "${name}"; declared branches are ${quoteValues(declared)}`,
                    subjects: [task.id, name],
                });
            }
        }
    }

    return violations;
}
