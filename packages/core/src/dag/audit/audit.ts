/**
 * Graph audit: read a DAG and report every structural problem without throwing.
 */

import type { DAGTask } from "../registered-task";
import { findBranchViolations } from "./branches";
import { findCycleViolations } from "./cycles";
import { findEdgeViolations } from "./edges";
import { findIdentifierViolations } from "./identifiers";
import { findTriggerViolations } from "./triggers";
import type { DAGViolation } from "./violation";

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
