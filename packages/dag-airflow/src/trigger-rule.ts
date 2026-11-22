/**
 * Airflow's trigger-rule names.
 *
 * The dialect stores the selected name in node config and never evaluates it;
 * the runtime interprets it as the node's activation policy.
 */

/** Supported trigger rules, keyed for use as an enum. */
export const TRIGGER_RULE_ENUM = {
    /** Run after every upstream node succeeds. */
    AllSuccess: "all_success",
    /** Run after every upstream node finishes, regardless of outcome. */
    AllDone: "all_done",
    /** Run when at least one upstream node succeeds. */
    OneSuccess: "one_success",
    /** Run when at least one upstream node fails. */
    OneFailed: "one_failed",
    /** Run when no upstream node fails. */
    NoneFailed: "none_failed",
    /** Run when no upstream node fails and at least one succeeds. */
    NoneFailedMinOneSuccess: "none_failed_min_one_success",
    /** Run when every upstream node is skipped. */
    AllSkipped: "all_skipped",
} as const;

/** A trigger rule accepted by a preset. */
export type TriggerRule =
    (typeof TRIGGER_RULE_ENUM)[keyof typeof TRIGGER_RULE_ENUM];

/** Applied by the runtime when a node omits `triggerRule`. */
export const DEFAULT_TRIGGER_RULE: TriggerRule = TRIGGER_RULE_ENUM.AllSuccess;
