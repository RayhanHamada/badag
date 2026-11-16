/**
 * DAG names known to trigger tasks.
 *
 * Empty by default, which leaves `dagName` a plain `string`. Augment the
 * interface to narrow `dagName` to the DAG names your project declares:
 *
 * ```ts
 * declare module "@badag/core" {
 *     interface DAGNameRegistry {
 *         nightly: true;
 *     }
 * }
 * ```
 *
 * Each key is a DAG name; the values are never read. The interface starts
 * empty on purpose, so the empty-interface lint rules are disabled below.
 */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type
export interface DAGNameRegistry {}

/**
 * A DAG name accepted by a trigger task.
 *
 * Widens to `string` while `DAGNameRegistry` has no keys, then narrows to the
 * registered names.
 */
export type DAGName = [keyof DAGNameRegistry] extends [never]
    ? string
    : Extract<keyof DAGNameRegistry, string>;
