import { describe, expect, it } from "vitest";

import * as sdk from "./index";

describe("@badag/sdk", () => {
    it("exposes the authoring and graph surface", () => {
        expect(Object.keys(sdk).toSorted()).toStrictEqual(
            [
                "AIRFLOW_FINDING_CODE",
                "AirflowDAG",
                "DEFAULT_TRIGGER_RULE",
                "GRAPH_FINDING_CODE",
                "TRIGGER_RULE_ENUM",
                "branch",
                "canonicalStringify",
                "check",
                "checkAirflow",
                "checkSpec",
                "createDAG",
                "defineNode",
                "delay",
                "isAirflowKey",
                "labeled",
                "sensor",
                "shortCircuit",
                "task",
                "trigger",
            ].toSorted()
        );
    });

    it("builds and validates a DAG through the SDK", () => {
        const dag = sdk.createDAG("etl");
        const extract = sdk.task("extract", { run: () => 42 });
        const load = sdk.task("load", { run: () => "stored" });

        expect(dag.parse`${extract} >> ${load}`).toBe(dag);

        const built = dag.build();

        expect(sdk.check(built.spec)).toStrictEqual([]);
        expect(built.spec.nodes.map((node) => node.key)).toStrictEqual([
            "extract",
            "load",
        ]);
        expect(built.implementations.has("load")).toBeTruthy();
    });
});
