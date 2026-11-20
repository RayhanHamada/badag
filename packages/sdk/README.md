# @badag/sdk

The published entry point. It re-exports the Airflow authoring dialect, the task layer, the graph spec types and findings, and the in-memory runtime, so one install covers authoring through execution.

The internal packages are source-only and are bundled into this package at build time; none of them is a runtime dependency of the published artifact.

```ts
import { check, createDAG, run, task } from "@badag/sdk";

const extract = task("extract", { run: () => 42 });
const load = task("load", { run: () => "stored" });

const dag = createDAG("etl").parse`${extract} >> ${load}`;

check(dag.spec()); // []
const result = await run(dag.build());
```

## Install

```sh
bun add @badag/sdk
```

ESM-only, ships declaration files, includes `@standard-schema/spec` for schema typing.

## Surface

| Export | From | Summary |
| --- | --- | --- |
| `createDAG`, `task`, `branch`, `sensor`, `delay`, `shortCircuit`, `trigger` | `@badag/airflow` | Airflow authoring dialect |
| `labeled`, `TRIGGER_RULE_ENUM`, `AIRFLOW_FINDING_CODE`, `check`, `checkAirflow` | `@badag/airflow` | Routing overrides, policies, findings |
| `defineNode` | `@badag/dag` | A node with typed schemas and an optional implementation |
| `checkSpec`, `GRAPH_FINDING_CODE`, `canonicalStringify` | `@badag/graph` | Structural findings and canonical JSON |
| `run`, `ACTIVATION_POLICY` | `@badag/runtime` | In-memory executor |

Type exports cover `GraphSpec`, `NodeDefinition`, `Implementation`, `BuiltDAG`, `TriggerRule`, `RunResult`, and the rest of the public contracts.

## Build

`sdk` is a Bun workspace package. `bun run build` bundles the internal packages with `tsdown`; `bun run test` checks the public surface and an end-to-end authoring run.

The package is pre-release (`0.0.0`). Persistence alignment for `@badag/db-schema` is still pending.
