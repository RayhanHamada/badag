import { describe, expect, it } from "vitest";

import * as sdk from "./index";

describe("@badag/sdk", () => {
    it("exposes the authoring, graph, and runtime surface", () => {
        expect(Object.keys(sdk).toSorted()).toStrictEqual(
            [
                "ACTIVATION_POLICY",
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
                "run",
                "sensor",
                "shortCircuit",
                "task",
                "trigger",
            ].toSorted()
        );
    });

    it("builds, validates, and runs a DAG through the SDK", async () => {
        const dag = sdk.createDAG("etl");
        const extract = sdk.task("extract", { run: () => 42 });
        const load = sdk.task("load", { run: () => "stored" });

        expect(dag.parse`${extract} >> ${load}`).toBe(dag);

        const built = dag.build();

        expect(sdk.check(built.spec)).toStrictEqual([]);

        const result = await sdk.run(built);

        expect(result.outcomes.get("load")?.status).toBe("succeeded");
    });
});
