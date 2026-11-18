/** Audit the DAG id and registered task ids against Airflow's convention. */

import { taskIdError } from "../../task/definition/task-id";
import { dagIdError } from "../dag-id";
import type { DAGTask } from "../registered-task";
import { DAG_VIOLATION_ENUM } from "./violation";
import type { DAGViolation } from "./violation";

/**
 * Report a DAG id or task id that does not follow Airflow's `validate_key`
 * convention.
 *
 * A DAG id is stored verbatim, so an invalid id is reported here. Registration
 * rejects an invalid task id first, so that finding only appears in graphs
 * restored or assembled outside the public methods. The DAG id is reported
 * before task ids.
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
        const idProblem = taskIdError(task.id);

        if (idProblem !== undefined) {
            violations.push({
                code: DAG_VIOLATION_ENUM.InvalidTaskId,
                message: idProblem,
                subjects: [task.id],
            });
        }
    }

    return violations;
}
