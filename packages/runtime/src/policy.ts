/**
 * Activation policies: the readiness algebra a node evaluates over its
 * route-active incoming edges.
 *
 * The names are the Airflow trigger-rule names because that vocabulary is the
 * dialect's; the graph layer stores the string and never interprets it.
 */

import type { OutcomeStatus } from "./types";

/** A policy the runtime understands. */
export const ACTIVATION_POLICY = {
    AllSuccess: "all_success",
    AllDone: "all_done",
    OneSuccess: "one_success",
    OneFailed: "one_failed",
    NoneFailed: "none_failed",
    NoneFailedMinOneSuccess: "none_failed_min_one_success",
    AllSkipped: "all_skipped",
} as const;

/** A policy name. */
export type ActivationPolicy =
    (typeof ACTIVATION_POLICY)[keyof typeof ACTIVATION_POLICY];

const POLICIES: ReadonlySet<string> = new Set(Object.values(ACTIVATION_POLICY));

/** Whether a stored config value names a policy the runtime understands. */
export function isActivationPolicy(value: unknown): value is ActivationPolicy {
    return typeof value === "string" && POLICIES.has(value);
}

function failed(outcome: OutcomeStatus): boolean {
    return outcome === "failed" || outcome === "cancelled";
}

/**
 * Whether a node should run, given its policy and the outcomes of its
 * route-active incoming edges.
 *
 * The caller waits until every active incoming edge is resolved, so
 * `all_done` is vacuously true here. A node with no active incoming edge never
 * reaches this function: it is skipped as unrouted.
 */
export function activates(
    policy: ActivationPolicy,
    outcomes: readonly OutcomeStatus[]
): boolean {
    switch (policy) {
        case ACTIVATION_POLICY.AllSuccess: {
            return outcomes.every((outcome) => outcome === "succeeded");
        }

        case ACTIVATION_POLICY.AllDone: {
            return true;
        }

        case ACTIVATION_POLICY.OneSuccess: {
            return outcomes.some((outcome) => outcome === "succeeded");
        }

        case ACTIVATION_POLICY.OneFailed: {
            return outcomes.some((outcome) => outcome === "failed");
        }

        case ACTIVATION_POLICY.NoneFailed: {
            return outcomes.every((outcome) => !failed(outcome));
        }

        case ACTIVATION_POLICY.NoneFailedMinOneSuccess: {
            return (
                outcomes.every((outcome) => !failed(outcome)) &&
                outcomes.some((outcome) => outcome === "succeeded")
            );
        }

        case ACTIVATION_POLICY.AllSkipped: {
            return (
                outcomes.length > 0 &&
                outcomes.every((outcome) => outcome === "skipped")
            );
        }

        default: {
            const exhaustiveCheck: never = policy;

            return exhaustiveCheck;
        }
    }
}
