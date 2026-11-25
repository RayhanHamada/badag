/**
 * Airflow-style wiring notation.
 *
 * `a >> b` makes `b` downstream of `a`; `a << b` makes `b` upstream of `a`.
 * Only the interpolated operands are typed: TypeScript cannot read the literal
 * `>>` / `<<` segments, so the operators are readable at runtime only and all
 * graph checks stay in the DAG.
 */

import type { AnyNodeDefinition } from "@badag/core";

/** One operand of a wiring expression: a task or a flat list of tasks. */
export type WiringOperand = AnyNodeDefinition | readonly AnyNodeDefinition[];

/** One wiring step: every operand on the left is upstream of every one on the right. */
export interface ParsedStep {
    readonly from: readonly AnyNodeDefinition[];
    readonly to: readonly AnyNodeDefinition[];
}

/** A parsed expression: its steps and every operand it named. */
export interface ParsedNotation {
    readonly steps: readonly ParsedStep[];
    readonly operands: readonly AnyNodeDefinition[];
}

const RIGHT_SHIFT = ">>";

const LEFT_SHIFT = "<<";

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

function isNodeDefinition(value: unknown): value is AnyNodeDefinition {
    return (
        typeof value === "object" &&
        value !== null &&
        Object.hasOwn(value, "key") &&
        Object.hasOwn(value, "type")
    );
}

function assertOperand(value: unknown, dagId: string): AnyNodeDefinition {
    if (isNodeDefinition(value)) {
        return value;
    }

    throw new TypeError(
        `Wiring expression in DAG "${dagId}" expects tasks; received ${describe(value)}`
    );
}

function operandGroup(
    operand: WiringOperand,
    dagId: string
): readonly AnyNodeDefinition[] {
    if (!Array.isArray(operand)) {
        return [assertOperand(operand, dagId)];
    }

    const group: AnyNodeDefinition[] = [];

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
        if (segment.includes("\n") || segment.includes("\r")) {
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

    const allOperands: AnyNodeDefinition[] = [];
    const steps: ParsedStep[] = [];
    let previous = operandGroup(operands[0], dagId);

    for (const definition of previous) {
        allOperands.push(definition);
    }

    for (let index = 1; index < operands.length; index += 1) {
        const segment = segments[index];
        const operator = segment.trim();
        const current = operandGroup(operands[index], dagId);

        if (operator === RIGHT_SHIFT) {
            steps.push({ from: previous, to: current });
        } else if (operator === LEFT_SHIFT) {
            steps.push({ from: current, to: previous });
        } else {
            throw new Error(
                `Unrecognized wiring syntax "${segment}" in DAG "${dagId}"; expected ">>" or "<<" between tasks`
            );
        }

        for (const definition of current) {
            allOperands.push(definition);
        }

        previous = current;
    }

    return { steps, operands: allOperands };
}
