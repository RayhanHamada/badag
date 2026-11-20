/**
 * Airflow-style wiring notation.
 *
 * `a >> b` makes `b` downstream of `a`; `a << b` makes `b` upstream of `a`.
 * Only the interpolated operands are typed: TypeScript cannot read the literal
 * `>>` / `<<` segments, so the operators are readable at runtime only and all
 * graph checks stay in the DAG.
 */

import type { AnyNodeDefinition } from "@badag/dag";

import { assertRouteLabel } from "./keys";

/** An operand that pairs a route label with the node it targets. */
export interface LabeledOperand {
    readonly label: string;
    readonly definition: AnyNodeDefinition;
}

/** One task or labeled task in a wiring expression. */
export type NotationOperand = AnyNodeDefinition | LabeledOperand;

/** One operand of a wiring expression: a task, a labeled task, or a flat list. */
export type WiringOperand = NotationOperand | readonly NotationOperand[];

/** One wiring step: every operand on the left is upstream of every one on the right. */
export interface ParsedStep {
    readonly from: readonly NotationOperand[];
    readonly to: readonly NotationOperand[];
}

/** A parsed expression: its steps and every operand it named. */
export interface ParsedNotation {
    readonly steps: readonly ParsedStep[];
    readonly operands: readonly NotationOperand[];
}

const RIGHT_SHIFT = ">>";

const LEFT_SHIFT = "<<";

/** Whitespace around a single operator is allowed; anything else is not. */
const OPERATOR_PATTERN = /^\s*(?<operator>>>|<<)\s*$/u;

// Operands cross the template boundary untyped for JavaScript callers; these
// checks establish the domain value before use.
// oxlint-disable anti-slop/no-runtime-typeof
// oxlint-disable anti-slop/no-unknown-parameters
function describe(value: unknown): string {
    try {
        return JSON.stringify(value) ?? String(value);
    } catch {
        return String(value);
    }
}

/**
 * Pair a route label with the node it targets.
 *
 * Use it on the right-hand side of an edge to override the label a router
 * would otherwise infer from the target's key.
 */
export function labeled(
    label: string,
    definition: AnyNodeDefinition
): LabeledOperand {
    assertRouteLabel(label);

    return Object.freeze({ label, definition });
}

/** Whether an operand carries an explicit label. */
export function isLabeled(operand: NotationOperand): operand is LabeledOperand {
    return "label" in operand && "definition" in operand;
}

function isNodeDefinition(value: unknown): value is AnyNodeDefinition {
    return (
        typeof value === "object" &&
        value !== null &&
        Object.hasOwn(value, "key") &&
        Object.hasOwn(value, "type")
    );
}

function assertOperand(value: unknown, dagId: string): NotationOperand {
    if (isNodeDefinition(value)) {
        return value;
    }

    if (
        typeof value === "object" &&
        value !== null &&
        Object.hasOwn(value, "label") &&
        Object.hasOwn(value, "definition")
    ) {
        // SAFETY: the two own-property checks above identify a LabeledOperand.
        return value as LabeledOperand;
    }

    throw new TypeError(
        `Wiring expression in DAG "${dagId}" expects tasks; received ${describe(value)}`
    );
}

function operandGroup(
    operand: WiringOperand,
    dagId: string
): readonly NotationOperand[] {
    if (!Array.isArray(operand)) {
        return [assertOperand(operand, dagId)];
    }

    const group: NotationOperand[] = [];

    for (const entry of operand) {
        if (Array.isArray(entry)) {
            throw new TypeError(
                `Wiring expression in DAG "${dagId}" cannot nest task lists`
            );
        }

        group.push(assertOperand(entry, dagId));
    }

    if (group.length === 0) {
        throw new TypeError(
            `Wiring expression in DAG "${dagId}" cannot use an empty task list`
        );
    }

    return group;
}
// oxlint-enable anti-slop/no-runtime-typeof
// oxlint-enable anti-slop/no-unknown-parameters

/**
 * Turn a tagged template into wiring steps.
 *
 * Exactly one expression is supported per call: the first and last segments
 * must be empty, every segment between two operands must be a lone `>>` or
 * `<<`, and a newline is rejected so a second expression needs a second call.
 */
export function parseNotation(
    dagId: string,
    segments: TemplateStringsArray,
    operands: readonly WiringOperand[]
): ParsedNotation {
    const [first] = segments;
    const last = segments.at(-1);

    if (operands.length === 0) {
        throw new Error(
            `Wiring expression in DAG "${dagId}" needs at least one task`
        );
    }

    for (const segment of segments) {
        if (/[\r\n]/u.test(segment)) {
            throw new Error(
                `Wiring expression in DAG "${dagId}" spans multiple lines; call parse once per expression`
            );
        }
    }

    if (first.trim() !== "") {
        throw new Error(
            `Unexpected "${first}" before the first task in DAG "${dagId}"`
        );
    }

    if (last !== undefined && last.trim() !== "") {
        throw new Error(
            `Unexpected "${last}" after the last task in DAG "${dagId}"`
        );
    }

    const groups = operands.map((operand) => operandGroup(operand, dagId));
    const steps: ParsedStep[] = [];

    for (let index = 1; index < groups.length; index += 1) {
        const segment = segments[index];
        const operator = OPERATOR_PATTERN.exec(segment)?.groups?.operator;
        const previous = groups[index - 1];
        const current = groups[index];

        if (operator === RIGHT_SHIFT) {
            steps.push({ from: previous, to: current });

            continue;
        }

        if (operator === LEFT_SHIFT) {
            steps.push({ from: current, to: previous });

            continue;
        }

        throw new Error(
            `Unrecognized wiring syntax "${segment}" in DAG "${dagId}"; expected ">>" or "<<" between tasks`
        );
    }

    return { steps, operands: groups.flat() };
}
