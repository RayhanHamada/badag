import { describe, expect, it } from "vitest";

import { checkSpec, GRAPH_FINDING_CODE } from "./check";
import type { GraphCheckInput } from "./check";

function spec(
    keys: readonly string[],
    edges: GraphCheckInput["edges"],
    key = "g"
): GraphCheckInput {
    return {
        key,
        nodes: keys.map((nodeKey) => ({
            key: nodeKey,
            type: "task",
            config: {},
        })),
        edges,
    };
}

describe("structural findings", () => {
    it("returns no findings for a valid spec", () => {
        expect(
            checkSpec(spec(["a", "b"], [{ from: "a", to: "b" }]))
        ).toStrictEqual([]);
    });

    it("reports a duplicate node", () => {
        const findings = checkSpec(spec(["a", "a"], [], "etl"));

        expect(findings).toStrictEqual([
            {
                code: GRAPH_FINDING_CODE.DuplicateNode,
                subjects: ["a"],
                message: 'Node "a" is declared more than once',
            },
        ]);
    });

    it("reports an unknown endpoint without throwing", () => {
        const findings = checkSpec(spec(["a"], [{ from: "a", to: "ghost" }]));

        expect(findings).toHaveLength(1);
        expect(findings[0]?.code).toBe(GRAPH_FINDING_CODE.UnknownNode);
        expect(findings[0]?.subjects).toStrictEqual(["ghost"]);
        expect(findings[0]?.message).toContain('"ghost"');
    });

    it("reports both missing endpoints once", () => {
        const findings = checkSpec(spec([], [{ from: "a", to: "b" }]));

        expect(findings).toHaveLength(1);
        expect(findings[0]?.subjects).toStrictEqual(["a", "b"]);
        expect(findings[0]?.message).toContain("unknown nodes");
    });

    it("reports a self edge and not a cycle", () => {
        const findings = checkSpec(spec(["a"], [{ from: "a", to: "a" }]));

        expect(findings).toStrictEqual([
            {
                code: GRAPH_FINDING_CODE.SelfEdge,
                subjects: ["a"],
                message: 'Node "a" cannot depend on itself',
            },
        ]);
    });

    it("reports a cycle from a spec loaded outside the builder", () => {
        const loaded = structuredClone(
            spec(
                ["a", "b", "c"],
                [
                    { from: "a", to: "b" },
                    { from: "b", to: "c" },
                    { from: "c", to: "a" },
                ],
                "etl"
            )
        );

        const findings = checkSpec(loaded);

        expect(findings).toHaveLength(1);
        expect(findings[0]?.code).toBe(GRAPH_FINDING_CODE.Cycle);
        expect(findings[0]?.subjects).toStrictEqual(["a", "b", "c", "a"]);
        expect(findings[0]?.message).toContain("a -> b -> c -> a");
    });

    it("reports both cycles in a figure eight", () => {
        const findings = checkSpec(
            spec(
                ["a", "b", "c", "d", "e"],
                [
                    { from: "a", to: "b" },
                    { from: "b", to: "c" },
                    { from: "c", to: "a" },
                    { from: "c", to: "d" },
                    { from: "d", to: "e" },
                    { from: "e", to: "c" },
                ]
            )
        );

        expect(findings.map((finding) => finding.subjects)).toStrictEqual([
            ["a", "b", "c", "a"],
            ["c", "d", "e", "c"],
        ]);
    });

    it("does not traverse edges with an unknown endpoint", () => {
        const findings = checkSpec(
            spec(
                ["a"],
                [
                    { from: "a", to: "ghost" },
                    { from: "ghost", to: "a" },
                ]
            )
        );

        expect(findings.map((finding) => finding.code)).toStrictEqual([
            GRAPH_FINDING_CODE.UnknownNode,
            GRAPH_FINDING_CODE.UnknownNode,
        ]);
    });
});
