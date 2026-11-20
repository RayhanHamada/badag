/**
 * Runtime result types.
 *
 * An outcome is terminal; scheduling states (pending, queued, running) are
 * transient and never appear here. `attempt` is always 1 until retries exist.
 */

import type { AnyImplementation } from "@badag/dag";
import type { GraphSpec } from "@badag/graph";

/** Terminal result of one node attempt. */
export type OutcomeStatus = "succeeded" | "failed" | "skipped" | "cancelled";

/** One resolved node. */
export interface NodeRun {
    readonly key: string;
    readonly status: OutcomeStatus;
    readonly attempt: number;
    /** The value a compute or router produced, when it succeeded. */
    readonly value?: unknown;
    /** Why the node failed. */
    readonly error?: string;
    /** Why the node was skipped. */
    readonly reason?: string;
}

/** One deterministic event, in resolution order. */
export type RunEvent =
    | {
          readonly type: "started";
          readonly key: string;
          readonly attempt: number;
      }
    | {
          readonly type: "succeeded";
          readonly key: string;
          readonly attempt: number;
      }
    | {
          readonly type: "failed";
          readonly key: string;
          readonly attempt: number;
          readonly error: string;
      }
    | {
          readonly type: "skipped";
          readonly key: string;
          readonly attempt: number;
          readonly reason: string;
      };

/** A spec plus the code that executes it. `dag.build()` returns this shape. */
export interface RunInput {
    readonly spec: GraphSpec;
    readonly implementations: ReadonlyMap<string, AnyImplementation>;
}

/** Everything a run produced. */
export interface RunResult {
    /** Resolved nodes in resolution order. */
    readonly outcomes: ReadonlyMap<string, NodeRun>;
    /** Events in resolution order; replaying them yields the same outcomes. */
    readonly events: readonly RunEvent[];
}
