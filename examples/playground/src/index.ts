import { check, run } from "@badag/sdk";

import { buildPricingDAG } from "./pipeline";
import type { Region } from "./pipeline";

const region: Region = process.env.REGION === "eu" ? "eu" : "us";
const dag = buildPricingDAG(region);
const findings = check(dag.spec());

console.log(`Daily pricing playground (region: ${region})`);

console.log("Findings:", findings);

if (findings.length > 0) {
    process.exitCode = 1;
} else {
    const { spec, implementations } = dag.build();

    console.log(`\nSpec ${spec.key} @ ${spec.revision}`);
    console.log(JSON.stringify(spec, null, 2));

    const result = await run({ spec, implementations });

    console.log("\nOutcomes:");

    for (const node of result.outcomes.values()) {
        const value =
            node.value === undefined ? "" : ` -> ${JSON.stringify(node.value)}`;

        console.log(`  ${node.key}: ${node.status}${value}`);
    }

    if (
        [...result.outcomes.values()].some((node) => node.status === "failed")
    ) {
        process.exitCode = 1;
    }
}
