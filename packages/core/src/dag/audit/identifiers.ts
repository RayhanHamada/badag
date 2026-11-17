/** Audit the DAG id and registered task names against Airflow's convention. */

import { taskNameError } from "../../task/definition/task-name";
import { dagIdError } from "../dag-id";
import type { DAGTask } from "../registered-task";
import { DAG_VIOLATION_ENUM } from "./violation";
import type { DAGViolation } from "./violation";

/**
 * Report a DAG id or task name that does not follow Airflow's `validate_key`
 * convention.
 *
 * A DAG id is stored verbatim, so an invalid id is reported here. Registration
 * rejects an invalid task name first, so that finding only appears in graphs
 * restored or assembled outside the public methods. The id is reported before
 * task names.
 */
export function findIdentifierViolations(
    dagId: string,
    tasks: readonly DAGTask[]
): DAGViolation[] {
    const violations: DAGViolation[] = [];
    const dagIdProblem = dagIdError(dagId);

    if (dagIdProblem !== undefined) {
        violations.push({
            code: DAG_VIOLATION_ENUM.InvalidDagId,
            message: dagIdProblem,
            subjects: [dagId],
        });
    }

    for (const task of tasks) {
        const nameProblem = taskNameError(task.name);

        if (nameProblem !== undefined) {
            violations.push({
                code: DAG_VIOLATION_ENUM.InvalidTaskName,
                message: nameProblem,
                subjects: [task.name],
            });
        }
    }

    return violations;
}
