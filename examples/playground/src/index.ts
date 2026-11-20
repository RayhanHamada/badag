import { check } from "@badag/sdk";

import { buildPricingDAG } from "./pipeline";

const dag = buildPricingDAG();
const spec = dag.spec();
const findings = check(spec);

console.log("Daily pricing playground");

console.log("Findings:", findings);

if (findings.length > 0) {
    process.exitCode = 1;
} else {
    console.log(`\nSpec ${spec.key} @ ${spec.revision}`);
    console.log(JSON.stringify(spec, null, 2));
}
