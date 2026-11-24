import { createGraph as createRawGraph } from "@badag/core";
import type { GraphEdge, GraphNodeInput, GraphSpec } from "@badag/core";
import { describe, expect, it } from "vitest";

import { AIRFLOW_FINDING_CODE, check, checkAirflow } from "./check";
import { createDAG } from "./dag";
import { branch, task, trigger } from "./presets";

function rawSpec(
    nodes: readonly GraphNodeInput[],
    edges: readonly GraphEdge[] = [],
    key = "etl"
): GraphSpec {
    const graph = createRawGraph(key);

    graph._apply({ nodes, edges });

    return graph.spec();
}

describe("dialect findings", () => {
    it("returns nothing for a clean graph", () => {
        const dag = createDAG("etl");

        const a = task("extract", { run: () => 1 });
        const b = task("load", { run: () => 2 });

        expect(dag.parse`${a} >> ${b}`).toBe(dag);

        expect(check(dag.spec())).toStrictEqual([]);
    });

    it("reports an invalid DAG id", () => {
        const findings = checkAirflow(rawSpec([], [], "bad id"));

        expect(findings.map((finding) => finding.code)).toStrictEqual([
            AIRFLOW_FINDING_CODE.InvalidDagId,
        ]);
    });

    it("reports an invalid node key", () => {
        const findings = checkAirflow(
            rawSpec([{ key: "bad key", type: "task" }])
        );

        expect(findings.map((finding) => finding.code)).toStrictEqual([
            AIRFLOW_FINDING_CODE.InvalidNodeKey,
        ]);
    });

    it("reports every branch problem in one pass", () => {
        const findings = checkAirflow(
            rawSpec(
                [
                    {
                        key: "route",
                        type: "branch",
                        config: {
                            role: "router",
                            branches: ["us", "us", "", "eu"],
                        },
                    },
                    { key: "us", type: "task" },
                    { key: "apac", type: "task" },
                ],
                [
                    { from: "route", to: "us", label: "us" },
                    { from: "route", to: "apac", label: "apac" },
                ]
            )
        );

        expect(
            findings.map((finding) => finding.code).toSorted()
        ).toStrictEqual(
            [
                AIRFLOW_FINDING_CODE.DuplicateDeclaredBranch,
                AIRFLOW_FINDING_CODE.InvalidDeclaredBranch,
                AIRFLOW_FINDING_CODE.UndeclaredBranchTarget,
                AIRFLOW_FINDING_CODE.UnroutedBranch,
            ].toSorted()
        );
    });

    it("reports a self trigger", () => {
        const dag = createDAG("nightly");
        dag.add(trigger("launch", { dagId: "nightly" }));

        const findings = checkAirflow(dag.spec());

        expect(findings).toStrictEqual([
            {
                code: AIRFLOW_FINDING_CODE.SelfTrigger,
                subjects: ["launch", "nightly"],
                message: 'Trigger "launch" cannot target its own DAG "nightly"',
            },
        ]);
    });

    it("composes structural findings with dialect findings", () => {
        const spec: GraphSpec = {
            specVersion: 1,
            key: "bad id",
            revision: "test",
            nodes: [
                { key: "a", type: "task", config: {} },
                { key: "b", type: "task", config: {} },
            ],
            edges: [
                { from: "a", to: "b" },
                { from: "b", to: "a" },
            ],
        };

        const codes = check(spec).map((finding) => finding.code);

        expect(codes).toContain("cycle");
        expect(codes).toContain(AIRFLOW_FINDING_CODE.InvalidDagId);
    });

    it("accepts a branch that routes exactly its declared labels", () => {
        const dag = createDAG("pricing");

        const route = branch("route", {
            branches: ["us", "eu"] as const,
            choose: () => "us",
        });

        const us = task("us", { run: () => 1 });
        const eu = task("eu", { run: () => 2 });

        expect(dag.parse`${route} >> ${[us, eu]}`).toBe(dag);

        expect(checkAirflow(dag.spec())).toStrictEqual([]);
    });
});
