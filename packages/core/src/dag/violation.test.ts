import { describe, expect, expectTypeOf, it } from "vitest";

import { DAG_VIOLATION_ENUM, quoteValues } from "./violation";
import type { DAGViolationCode } from "./violation";

describe("DAG violation codes", () => {
    it("lists exactly the eleven documented codes", () => {
        expect(DAG_VIOLATION_ENUM).toStrictEqual({
            InvalidDagId: "invalid-dag-id",
            InvalidTaskId: "invalid-task-id",
            Cycle: "cycle",
            SelfEdge: "self-edge",
            ForeignEdge: "foreign-edge",
            InconsistentEdge: "inconsistent-edge",
            UnroutedBranch: "unrouted-branch",
            UndeclaredBranchTarget: "undeclared-branch-target",
            DuplicateDeclaredBranch: "duplicate-declared-branch",
            InvalidDeclaredBranch: "invalid-declared-branch",
            SelfTrigger: "self-trigger",
        });
        expect(Object.keys(DAG_VIOLATION_ENUM)).toHaveLength(11);
    });

    it("types each code as its literal", () => {
        expectTypeOf(DAG_VIOLATION_ENUM.Cycle).toEqualTypeOf<"cycle">();
        expectTypeOf(
            DAG_VIOLATION_ENUM.SelfTrigger
        ).toEqualTypeOf<"self-trigger">();
    });

    it("covers every code in the code union", () => {
        expectTypeOf<DAGViolationCode>().toEqualTypeOf<
            | "invalid-dag-id"
            | "invalid-task-id"
            | "cycle"
            | "self-edge"
            | "foreign-edge"
            | "inconsistent-edge"
            | "unrouted-branch"
            | "undeclared-branch-target"
            | "duplicate-declared-branch"
            | "invalid-declared-branch"
            | "self-trigger"
        >();
    });
});

describe("quoting violation subjects", () => {
    it("renders values quoted and comma-separated", () => {
        expect(quoteValues(["us", "eu"])).toBe('"us", "eu"');
    });

    it("renders a single value", () => {
        expect(quoteValues(["cycle"])).toBe('"cycle"');
    });

    it("renders an empty list as an empty string", () => {
        expect(quoteValues([])).toBe("");
    });
});
