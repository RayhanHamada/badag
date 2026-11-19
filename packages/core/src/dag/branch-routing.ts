/**
 * Branch routing rules and the wiring-time check.
 *
 * A branch task declares the branch names a scheduler may follow, so its
 * direct downstream tasks must name exactly those branches. Both directions
 * are checked: routing to an undeclared task, and declaring a branch the branch
 * task does not route to. The audit reports the same problems as findings, so
 * the message text lives here and both paths share it.
 */

import { TASK_KIND_ENUM } from "../task/kind";
import type { DAGTask } from "./registered-task";
import { DAG_VIOLATION_ENUM, quoteValues } from "./violation";
import type { DAGViolation } from "./violation";

/**
 * The declared branch names of a branch task.
 *
 * `undefined` for every other kind, and for a branch that declares no
 * `branches` set — an undeclared branch set means the wiring is unchecked.
 */
export function declaredBranches(task: DAGTask): readonly string[] | undefined {
    const { definition } = task;

    return definition.kind === TASK_KIND_ENUM.Branch
        ? definition.branches
        : undefined;
}

/**
 * The finding for routing a branch to a task it does not declare.
 */
export function undeclaredBranchViolation(
    source: DAGTask,
    targetId: string,
    declared: readonly string[]
): DAGViolation {
    return {
        code: DAG_VIOLATION_ENUM.UndeclaredBranchTarget,
        message:
            declared.length === 0
                ? `Branch "${source.id}" cannot route to "${targetId}"; it declares no branches`
                : `Branch "${source.id}" cannot route to "${targetId}"; declared branches are ${quoteValues(declared)}`,
        subjects: [source.id, targetId],
    };
}

/**
 * The finding for a declared branch the task does not route to.
 */
export function unroutedBranchViolation(
    source: DAGTask,
    name: string
): DAGViolation {
    return {
        code: DAG_VIOLATION_ENUM.UnroutedBranch,
        message: `Branch "${source.id}" must route to declared branch "${name}"`,
        subjects: [source.id, name],
    };
}

/**
 * Assert that one wiring step matches every declared branch set on its
 * upstream side.
 *
 * `routed` holds the downstream tasks the enclosing batch plans to add, so
 * branches wired by an earlier call still count; that keeps repeating a
 * successful wiring call a no-op instead of an error. Downstream tasks are
 * never inspected: a branch constrains what it routes to, not what those tasks
 * then require.
 */
export function assertBranchWiring(
    sources: readonly DAGTask[],
    added: readonly DAGTask[],
    routed: ReadonlyMap<DAGTask, ReadonlySet<DAGTask>>
): void {
    if (added.length === 0) {
        return;
    }

    for (const source of sources) {
        const declared = declaredBranches(source);

        if (declared === undefined) {
            continue;
        }

        for (const target of added) {
            if (!declared.includes(target.id)) {
                throw new Error(
                    undeclaredBranchViolation(source, target.id, declared)
                        .message
                );
            }
        }

        const wired = routed.get(source) ?? source.downstream;

        for (const name of declared) {
            if (![...wired].some((task) => task.id === name)) {
                throw new Error(unroutedBranchViolation(source, name).message);
            }
        }
    }
}
