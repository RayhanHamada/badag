import { describe, expect, it } from "vitest";

import { task as createTask } from "../task/task";
import { parseWiringExpression } from "./wiring";
import type { WiringOperand } from "./wiring";

const parse = (
    segments: TemplateStringsArray,
    ...operands: readonly WiringOperand[]
) => parseWiringExpression("etl", segments, operands);

const named = (
    segments: TemplateStringsArray,
    ...operands: readonly WiringOperand[]
) => parseWiringExpression("analytics-nightly", segments, operands);

/**
 * Build the segment array a tagged template would supply.
 *
 * Operator probes need text that cannot be written as an interpolation, since
 * an interpolated value becomes an operand rather than a segment.
 */
function templateSegments(parts: readonly string[]): TemplateStringsArray {
    const segments = [...parts];

    // SAFETY: a tagged template supplies exactly a string array plus a `raw`
    // string array; the parser reads neither `raw` nor any other property.
    return Object.assign(segments, { raw: segments }) as TemplateStringsArray;
}

describe("wiring expression parser", () => {
    const a = createTask("a", { fn: () => "a" });
    const b = createTask("b", { fn: () => "b" });
    const c = createTask("c", { fn: () => "c" });

    it("reads >> as left to right", () => {
        const { steps } = parse`${a} >> ${b} >> ${c}`;

        expect(steps).toStrictEqual([
            [[a], [b]],
            [[b], [c]],
        ]);
    });

    it("reads << as right to left", () => {
        const { steps } = parse`${a} << ${b} << ${c}`;

        expect(steps).toStrictEqual([
            [[b], [a]],
            [[c], [b]],
        ]);
    });

    it("composes mixed operators left to right", () => {
        const mixed = parse`${a} >> ${b} << ${c}`;
        const sets = parse`${[a, c]} >> ${b}`;

        expect(mixed.steps).toStrictEqual([
            [[a], [b]],
            [[c], [b]],
        ]);
        expect(sets.steps).toStrictEqual([[[a, c], [b]]]);
    });

    it("flattens a wiring set into one side of a step", () => {
        const { steps, tasks } = parse`${[a, b]} >> ${[c]}`;

        expect(steps).toStrictEqual([[[a, b], [c]]]);
        expect(tasks).toStrictEqual([a, b, c]);
    });

    it("returns no steps for a single operand", () => {
        const { steps, tasks } = parse`${a}`;

        expect(steps).toStrictEqual([]);
        expect(tasks).toStrictEqual([a]);
    });

    it("allows whitespace around an operator", () => {
        expect(parse`${a}>>${b}`.steps).toStrictEqual([[[a], [b]]]);
        expect(parse`${a}   >>   ${b}`.steps).toStrictEqual([[[a], [b]]]);
    });

    it("rejects an empty expression", () => {
        expect(() => parse``).toThrow(
            'Wiring expression in DAG "etl" needs at least one task'
        );
    });

    it("rejects text before the first operand", () => {
        expect(() => parse`a ${a} >> ${b}`).toThrow(
            'Unexpected "a " before the first task in DAG "etl"'
        );
    });

    it("rejects text after the last operand", () => {
        expect(() => parse`${a} >> ${b} b`).toThrow(
            'Unexpected " b" after the last task in DAG "etl"'
        );
    });

    it("rejects adjacent operands without an operator", () => {
        expect(() => parse`${a} ${b}`).toThrow(
            /Unrecognized wiring syntax " " in DAG "etl"; expected ">>" or "<<" between tasks/u
        );
    });

    it("rejects an unknown operator", () => {
        expect(() => parse`${a} & ${b}`).toThrow(
            /Unrecognized wiring syntax " & " in DAG "etl"/u
        );
    });

    it("rejects a doubled operator", () => {
        expect(() => parse`${a} >> >> ${b}`).toThrow(
            /Unrecognized wiring syntax/u
        );
    });

    it("rejects a multiline expression", () => {
        expect(
            () => parse`${a} >> ${b}
${c} >> ${a}`
        ).toThrow(
            'Wiring expression in DAG "etl" spans multiple lines; call parse once per expression'
        );
    });

    it("rejects nested task lists", () => {
        expect(
            () =>
                // @ts-expect-error - deliberately malformed for the runtime guard
                parse`${[a, [b]]} >> ${c}`
        ).toThrow('Wiring expression in DAG "etl" cannot nest task lists');
    });

    it("rejects an empty task list", () => {
        expect(() => parse`${a} >> ${[]}`).toThrow(
            'Wiring expression in DAG "etl" cannot use an empty task list'
        );
    });

    it("rejects a non-task operand", () => {
        expect(
            () =>
                // @ts-expect-error - deliberately malformed for the runtime guard
                parse`${"task"} >> ${b}`
        ).toThrow(
            'Wiring expression in DAG "etl" expects tasks; received "task"'
        );
    });

    it("rejects a non-task entry inside a task list", () => {
        expect(
            () =>
                // @ts-expect-error - deliberately malformed for the runtime guard
                parse`${[a, 3]} >> ${b}`
        ).toThrow('Wiring expression in DAG "etl" expects tasks; received 3');
    });

    it("rejects the remaining unknown operators", () => {
        for (const operator of [
            " & ",
            " | ",
            " + ",
            " -> ",
            " >>> ",
            " <<< ",
            " = ",
            " !== ",
        ]) {
            expect(() =>
                parseWiringExpression(
                    "etl",
                    templateSegments(["", operator, ""]),
                    [a, b]
                )
            ).toThrow(/Unrecognized wiring syntax/u);
        }
    });

    it("rejects a single-character fragment of an operator", () => {
        expect(() => parse`${a} > ${b}`).toThrow(
            'Unrecognized wiring syntax " > " in DAG "etl"; expected ">>" or "<<" between tasks'
        );
        expect(() => parse`${a} < ${b}`).toThrow(
            'Unrecognized wiring syntax " < " in DAG "etl"; expected ">>" or "<<" between tasks'
        );
    });

    it("rejects a dangling trailing operator", () => {
        expect(() => parse`${a} >> ${b} >>`).toThrow(
            'Unexpected " >>" after the last task in DAG "etl"'
        );
        expect(() => parse`${a} >> ${b} >> >>`).toThrow(
            'Unexpected " >> >>" after the last task in DAG "etl"'
        );
    });

    it("rejects a newline around or between operands", () => {
        const message =
            'Wiring expression in DAG "etl" spans multiple lines; call parse once per expression';

        expect(() => parse`${a}\n>> ${b}`).toThrow(message);
        expect(() => parse`${a} >>\n${b}`).toThrow(message);
        expect(() => parse`\n${a} >> ${b}`).toThrow(message);
        expect(() => parse`${a} >> ${b}\r\n`).toThrow(message);
    });

    it("rejects a template that wraps one expression over several lines", () => {
        const message =
            'Wiring expression in DAG "etl" spans multiple lines; call parse once per expression';

        expect(() => parse`${a}\n>>\n${b}`).toThrow(message);
        expect(
            () => parse`${a} >> ${b}
${c} >> ${a}`
        ).toThrow(message);
    });

    it("accepts a tab between an operator and an operand", () => {
        expect(parse`${a}\t>>\t${b}`.steps).toStrictEqual([[[a], [b]]]);
    });

    it("keeps a repeated operand in the task list", () => {
        const { steps, tasks } = parse`${a} >> ${a}`;

        expect(steps).toStrictEqual([[[a], [a]]]);
        expect(tasks).toStrictEqual([a, a]);
    });

    it("keeps duplicates inside one wiring set", () => {
        const { steps } = parse`${[a, a]} >> ${b}`;

        expect(steps).toStrictEqual([[[a, a], [b]]]);
    });

    it("preserves operand order across the flattened task list", () => {
        const { tasks } = parse`${[b, a]} >> ${c}`;

        expect(tasks).toStrictEqual([b, a, c]);
    });

    it("returns one step per operator for a long chain", () => {
        const d = createTask("d", { fn: () => "d" });
        const e = createTask("e", { fn: () => "e" });
        const { steps } = parse`${a} >> ${b} >> ${c} >> ${d} >> ${e}`;

        expect(steps).toStrictEqual([
            [[a], [b]],
            [[b], [c]],
            [[c], [d]],
            [[d], [e]],
        ]);
    });

    it("produces the same edges as the mirrored >> expression", () => {
        const leftward = parse`${a} << ${b} << ${c}`;
        const rightward = parse`${c} >> ${b} >> ${a}`;

        expect(leftward.steps).toStrictEqual([
            [[b], [a]],
            [[c], [b]],
        ]);
        expect(leftward.steps.toReversed()).toStrictEqual(rightward.steps);
    });

    it("includes the DAG id in every message", () => {
        expect(() => named`${a} & ${b}`).toThrow(/"analytics-nightly"/u);
        expect(() => named`${a} >> ${[]}`).toThrow(/"analytics-nightly"/u);
        expect(() => named``).toThrow(/"analytics-nightly"/u);
    });

    it("rejects a null operand", () => {
        expect(
            () =>
                // @ts-expect-error - deliberately malformed for the runtime guard
                parse`${null} >> ${b}`
        ).toThrow(
            'Wiring expression in DAG "etl" expects tasks; received null'
        );
    });

    it("rejects an object that is not a task definition", () => {
        expect(
            () =>
                // @ts-expect-error - deliberately malformed for the runtime guard
                parse`${{ id: "n" }} >> ${b}`
        ).toThrow(/expects tasks; received/u);
    });
});
