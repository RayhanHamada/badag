/**
 * Dialect findings: rules the Airflow vocabulary adds on top of the graph.
 *
 * `checkAirflow` is pure and never throws. `check` composes it with the
 * structural findings so a caller can ask once whether a spec is fit to run.
 */

import { checkSpec } from "@badag/core";
import type { GraphFinding, GraphSpec, JsonValue } from "@badag/core";

import { airflowKeyError } from "./keys";

/** Machine-readable categories for dialect findings. */
export const AIRFLOW_FINDING_CODE = {
    /** The DAG id does not follow Airflow's `validate_key` convention. */
    InvalidDagId: "invalid-dag-id",
    /** A node key does not follow Airflow's `validate_key` convention. */
    InvalidNodeKey: "invalid-node-key",
    /** A branch declares the same route label more than once. */
    DuplicateDeclaredBranch: "duplicate-declared-branch",
    /** A declared route label is empty or whitespace. */
    InvalidDeclaredBranch: "invalid-declared-branch",
    /** A declared route label has no outgoing edge carrying it. */
    UnroutedBranch: "unrouted-branch",
    /** An outgoing edge carries a label the branch never declared. */
    UndeclaredBranchTarget: "undeclared-branch-target",
    /** A labeled edge's label is not its target node key. */
    LabelKeyMismatch: "label-key-mismatch",
    /** A trigger targets the DAG that contains it. */
    SelfTrigger: "self-trigger",
} as const;

/** A category reported by `checkAirflow`. */
export type AirflowFindingCode =
    (typeof AIRFLOW_FINDING_CODE)[keyof typeof AIRFLOW_FINDING_CODE];

/** One dialect problem. */
export interface AirflowFinding {
    readonly code: AirflowFindingCode;
    readonly subjects: readonly string[];
    readonly message: string;
}

function outgoingLabels(
    spec: GraphSpec
): ReadonlyMap<string, ReadonlySet<string>> {
    const labels = new Map<string, Set<string>>();

    for (const edge of spec.edges) {
        if (edge.label === undefined) {
            continue;
        }

        const set = labels.get(edge.from) ?? new Set<string>();

        set.add(edge.label);
        labels.set(edge.from, set);
    }

    return labels;
}

// `branches` is open JSON at runtime; these checks establish the domain value.
// oxlint-disable anti-slop/no-runtime-typeof
function branchFindings(
    key: string,
    branches: JsonValue,
    labels: ReadonlySet<string>,
    push: (finding: AirflowFinding) => void
): void {
    if (!Array.isArray(branches)) {
        push({
            code: AIRFLOW_FINDING_CODE.InvalidDeclaredBranch,
            subjects: [key],
            message: `Branch "${key}" must declare its branches as a list of strings`,
        });

        return;
    }

    const declared = new Set<string>();
    let valid = 0;

    for (const entry of branches) {
        if (typeof entry !== "string") {
            push({
                code: AIRFLOW_FINDING_CODE.InvalidDeclaredBranch,
                subjects: [key],
                message: `Branch "${key}" declares a branch name that is not a string`,
            });

            continue;
        }

        if (entry.trim() === "") {
            push({
                code: AIRFLOW_FINDING_CODE.InvalidDeclaredBranch,
                subjects: [key, entry],
                message: `Branch "${key}" declares an empty branch name`,
            });

            continue;
        }

        if (declared.has(entry)) {
            push({
                code: AIRFLOW_FINDING_CODE.DuplicateDeclaredBranch,
                subjects: [key, entry],
                message: `Branch "${key}" declares branch "${entry}" more than once`,
            });

            continue;
        }

        declared.add(entry);
        valid += 1;
    }

    if (valid === 0) {
        return;
    }

    for (const name of declared) {
        if (!labels.has(name)) {
            push({
                code: AIRFLOW_FINDING_CODE.UnroutedBranch,
                subjects: [key, name],
                message: `Branch "${key}" must route to declared branch "${name}"`,
            });
        }
    }

    for (const label of labels) {
        if (!declared.has(label)) {
            push({
                code: AIRFLOW_FINDING_CODE.UndeclaredBranchTarget,
                subjects: [key, label],
                message: `Branch "${key}" routes to undeclared branch "${label}"; declared branches are ${[...declared].map((name) => `"${name}"`).join(", ")}`,
            });
        }
    }
}
// oxlint-enable anti-slop/no-runtime-typeof

/**
 * Return every dialect problem in a spec, without throwing.
 */
export function checkAirflow(spec: GraphSpec): readonly AirflowFinding[] {
    const findings: AirflowFinding[] = [];
    const seen = new Set<string>();

    const push = (finding: AirflowFinding): void => {
        const id = `${finding.code}\u0000${finding.subjects.join("\u0000")}\u0000${finding.message}`;

        if (seen.has(id)) {
            return;
        }

        seen.add(id);
        findings.push(finding);
    };

    const dagProblem = airflowKeyError("DAG id", spec.key);

    if (dagProblem !== undefined) {
        push({
            code: AIRFLOW_FINDING_CODE.InvalidDagId,
            subjects: [spec.key],
            message: dagProblem,
        });
    }

    const labels = outgoingLabels(spec);

    for (const edge of spec.edges) {
        if (edge.label === undefined || edge.label === edge.to) {
            continue;
        }

        push({
            code: AIRFLOW_FINDING_CODE.LabelKeyMismatch,
            subjects: [edge.from, edge.to, edge.label],
            message: `Edge "${edge.from}" -> "${edge.to}" carries label "${edge.label}"; a route label must equal the target node key "${edge.to}"`,
        });
    }

    for (const node of spec.nodes) {
        const keyProblem = airflowKeyError("Node key", node.key);

        if (keyProblem !== undefined) {
            push({
                code: AIRFLOW_FINDING_CODE.InvalidNodeKey,
                subjects: [node.key],
                message: keyProblem,
            });
        }

        const { branches } = node.config;

        if (branches !== undefined) {
            branchFindings(
                node.key,
                branches,
                labels.get(node.key) ?? new Set(),
                push
            );
        }

        if (node.type === "trigger" && node.config.dagId === spec.key) {
            push({
                code: AIRFLOW_FINDING_CODE.SelfTrigger,
                subjects: [node.key, spec.key],
                message: `Trigger "${node.key}" cannot target its own DAG "${spec.key}"`,
            });
        }
    }

    return findings;
}

/**
 * Return the structural findings followed by the dialect findings.
 */
export function check(
    spec: GraphSpec
): readonly (GraphFinding | AirflowFinding)[] {
    return [...checkSpec(spec), ...checkAirflow(spec)];
}
