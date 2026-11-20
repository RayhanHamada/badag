import { createDAG, defineNode } from "@badag/dag";
import { describe, expect, it } from "vitest";

import { run } from "./run";

describe("dag to runtime", () => {
    it("runs a built DAG end to end", async () => {
        const dag = createDAG("etl");

        const extract = defineNode({
            key: "extract",
            type: "task",
            config: { role: "compute", retries: 1 },
            run: () => 42,
        });

        const load = defineNode({
            key: "load",
            type: "task",
            run: () => "stored",
        });

        dag.add(extract).add(load).link("extract", "load");

        const built = dag.build();
        const result = await run(built);

        expect([...result.outcomes.keys()]).toStrictEqual(["extract", "load"]);
        expect(result.outcomes.get("extract")).toMatchObject({
            status: "succeeded",
            attempt: 1,
            value: 42,
        });
        expect(JSON.stringify(built.spec)).not.toContain('"run"');
    });
});
