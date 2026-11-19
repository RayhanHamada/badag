/**
 * Graph audit: read a DAG and report every structural problem without throwing.
 *
 * `findViolations` is the only entry point; each rule below is private to it
 * and reports values rather than tasks, so a scheduler can act on a finding
 * without holding the task it came from.
 */

import { keyError } from "../airflow-key";
import { isTaskId } from "../task/id";
import { TASK_KIND_ENUM } from "../task/kind";
import {
    declaredBranches,
    undeclaredBranchViolation,
    unroutedBranchViolation,
} from "./branch-routing";
import type { DAGTask } from "./registered-task";
import { DAG_VIOLATION_ENUM, quoteValues } from "./violation";
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
function findIdentifierViolations(
    dagId: string,
    tasks: readonly DAGTask[]
): DAGViolation[] {
    const violations: DAGViolation[] = [];
    const dagIdProblem = keyError("DAG id", dagId);

    if (dagIdProblem !== undefined) {
        violations.push({
            code: DAG_VIOLATION_ENUM.InvalidDagId,
            message: dagIdProblem,
            subjects: [dagId],
        });
    }

    for (const task of tasks) {
        const idProblem = keyError("Task ID", task.id);

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

/**
 * Report every self edge, foreign edge, and half-recorded edge.
 *
 * The two walks report disjoint conditions on the same directed edge: the
 * downstream walk reports a missing upstream record, the upstream walk a
 * missing downstream record, so an edge yields at most one finding.
 *
 * Only `downstream` and `upstream` are read, so the walk sees exactly the
 * graph a scheduler would.
 */
function findEdgeViolations(
    dagId: string,
    tasks: readonly DAGTask[],
    registered: ReadonlySet<DAGTask>
): DAGViolation[] {
    const violations: DAGViolation[] = [];

    for (const task of tasks) {
        for (const downstream of task.downstream) {
            if (downstream === task) {
                violations.push({
                    code: DAG_VIOLATION_ENUM.SelfEdge,
                    message: `Task "${task.id}" depends on itself`,
                    subjects: [task.id],
                });
                continue;
            }

            if (!registered.has(downstream)) {
                violations.push({
                    code: DAG_VIOLATION_ENUM.ForeignEdge,
                    message: `Edge "${task.id}" -> "${downstream.id}" crosses DAG boundaries; "${downstream.id}" is not registered in DAG "${dagId}"`,
                    subjects: [task.id, downstream.id],
                });
                continue;
            }

            if (!downstream.upstream.has(task)) {
                violations.push({
                    code: DAG_VIOLATION_ENUM.InconsistentEdge,
                    message: `Edge "${task.id}" -> "${downstream.id}" is recorded on only one side`,
                    subjects: [task.id, downstream.id],
                });
            }
        }

        for (const upstream of task.upstream) {
            if (upstream === task) {
                // The downstream walk reports a self edge from either side;
                // here it is reported only when that side was missing.
                if (!task.downstream.has(task)) {
                    violations.push({
                        code: DAG_VIOLATION_ENUM.SelfEdge,
                        message: `Task "${task.id}" depends on itself`,
                        subjects: [task.id],
                    });
                }

                continue;
            }

            if (!registered.has(upstream)) {
                violations.push({
                    code: DAG_VIOLATION_ENUM.ForeignEdge,
                    message: `Edge "${upstream.id}" -> "${task.id}" crosses DAG boundaries; "${upstream.id}" is not registered in DAG "${dagId}"`,
                    subjects: [upstream.id, task.id],
                });
                continue;
            }

            if (!upstream.downstream.has(task)) {
                violations.push({
                    code: DAG_VIOLATION_ENUM.InconsistentEdge,
                    message: `Edge "${upstream.id}" -> "${task.id}" is recorded on only one side`,
                    subjects: [upstream.id, task.id],
                });
            }
        }
    }

    return violations;
}

/** One task on the depth-first path, plus how far its children were walked. */
interface Frame {
    readonly task: DAGTask;
    readonly children: readonly DAGTask[];
    index: number;
}

/**
 * Report one violation per simple cycle in the graph.
 *
 * Each cycle is emitted once, at the back edge that closes it: a task is
 * explored once, then closed and never re-entered, so no cycle can be found
 * from two entry points. Distinct cycles that share tasks are separate
 * findings, because each closes on its own back edge.
 */
function findCycleViolations(
    dagId: string,
    tasks: readonly DAGTask[],
    registered: ReadonlySet<DAGTask>
): DAGViolation[] {
    const violations: DAGViolation[] = [];
    const open = new Set<DAGTask>();
    const closed = new Set<DAGTask>();

    for (const root of tasks) {
        if (open.has(root) || closed.has(root)) {
            continue;
        }

        const frames: Frame[] = [];

        const enter = (task: DAGTask): void => {
            open.add(task);
            frames.push({
                task,
                children: [...task.downstream].filter(
                    (child) =>
                        child !== task &&
                        registered.has(child) &&
                        !closed.has(child)
                ),
                index: 0,
            });
        };

        enter(root);

        while (frames.length > 0) {
            const frame = frames.at(-1);

            if (frame === undefined) {
                break;
            }

            if (frame.index >= frame.children.length) {
                open.delete(frame.task);
                closed.add(frame.task);
                frames.pop();
                continue;
            }

            const child = frame.children[frame.index];
            frame.index += 1;

            if (closed.has(child)) {
                continue;
            }

            if (!open.has(child)) {
                enter(child);
                continue;
            }

            const start = frames.findIndex((entry) => entry.task === child);

            const cycle = [
                ...frames.slice(start).map((entry) => entry.task),
                child,
            ];

            violations.push({
                code: DAG_VIOLATION_ENUM.Cycle,
                message: `DAG "${dagId}" contains a cycle: ${quoteValues(
                    cycle.map((task) => task.id)
                )}`,
                subjects: cycle.map((task) => task.id),
            });
        }
    }

    return violations;
}

/**
 * Report branch tasks whose wiring disagrees with their declared branches.
 *
 * Only registered downstream tasks count: an edge to a task in another DAG is
 * a foreign-edge finding, not a routing one. A branch that declares no
 * branches at all is unconstrained and never reported.
 */
function findBranchViolations(
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
                violations.push(unroutedBranchViolation(task, name));
            }
        }

        for (const name of new Set(routed)) {
            if (!declared.includes(name)) {
                violations.push(
                    undeclaredBranchViolation(task, name, declared)
                );
            }
        }
    }

    return violations;
}

/**
 * Report trigger tasks that start the DAG containing them.
 *
 * A trigger task points at a target DAG, so a task targeting its own DAG starts
 * a copy of itself; the SDK does not run DAGs, but no scheduler can execute
 * that request. The target id is compared after trimming, while the
 * containing DAG id is validated without surrounding whitespace.
 */
function findTriggerViolations(
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

/**
 * Return every violation in a graph, in registration order.
 *
 * Pure: the graph is only read, so calling this is always safe and never
 * throws. Identifier findings come first, then edges, cycles, branch routing,
 * and trigger findings.
 */
export function findViolations(
    dagId: string,
    tasks: readonly DAGTask[]
): readonly DAGViolation[] {
    const registered = new Set(tasks);

    return [
        ...findIdentifierViolations(dagId, tasks),
        ...findEdgeViolations(dagId, tasks, registered),
        ...findCycleViolations(dagId, tasks, registered),
        ...findBranchViolations(tasks, registered),
        ...findTriggerViolations(dagId, tasks),
    ];
}
