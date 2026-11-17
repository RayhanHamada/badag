/**
 * DAG ids known to trigger tasks.
 *
 * Empty by default, which leaves `dagId` a plain `string`. Augment the
 * interface to narrow `dagId` to the DAG ids your project declares:
 *
 * ```ts
 * declare module "@badag/core" {
 *     interface DAGIdRegistry {
 *         nightly: true;
 *     }
 * }
 * ```
 *
 * Each key is a DAG id; the values are never read. The interface starts empty
 * on purpose, so the empty-interface lint rules are disabled below.
 */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type
export interface DAGIdRegistry {}

/**
 * A DAG id accepted by a trigger task.
 *
 * Widens to `string` while `DAGIdRegistry` has no keys, then narrows to the
 * registered ids.
 */
export type DAGId = [keyof DAGIdRegistry] extends [never]
    ? string
    : Extract<keyof DAGIdRegistry, string>;
