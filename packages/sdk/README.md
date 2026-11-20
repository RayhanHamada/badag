# @badag/sdk

The published entry point for the Airflow dialect and the shared graph/task stack. It re-exports the Airflow authoring surface, the task layer, and the graph spec types and findings, so one install covers authoring, compilation, and validation.

Airflow is the first dialect; the graph spec and implementation registry are dialect-agnostic. A future dialect can ship its own authoring surface and compile to `GraphSpec` v1. No second dialect exists yet.

The graph, DAG, and Airflow packages are source-only and are bundled into this package at build time; none is an external dependency of the published artifact.

```ts
import { check, createDAG, task } from "@badag/sdk";

const extract = task("extract", { run: () => 42 });
const load = task("load", { run: () => "stored" });

const dag = createDAG("etl").parse`${extract} >> ${load}`;

check(dag.spec()); // [] — structural and dialect findings

const { spec, implementations } = dag.build();

spec.nodes.map((node) => node.key); // ["extract", "load"]
implementations.has("load"); // true
```

`build()` separates the serializable spec from build-local implementations. The SDK does not execute either channel.

## Install

```sh
bun add @badag/sdk
```

ESM-only, ships declaration files, includes `@standard-schema/spec` for schema typing.

## Surface

| Export | From | Summary |
| --- | --- | --- |
| `AirflowDAG`, `createDAG`, `task`, `branch`, `sensor`, `delay`, `shortCircuit`, `trigger` | `@badag/airflow` | First dialect: authoring surface |
| `labeled`, `TRIGGER_RULE_ENUM`, `DEFAULT_TRIGGER_RULE`, `AIRFLOW_FINDING_CODE`, `isAirflowKey`, `check`, `checkAirflow` | `@badag/airflow` | Routing overrides, policies, key convention, findings |
| `defineNode` | `@badag/dag` | A node with typed schemas and an optional implementation |
| `checkSpec`, `GRAPH_FINDING_CODE`, `canonicalStringify` | `@badag/graph` | Structural findings and canonical JSON |

Type exports cover `GraphSpec`, `NodeDefinition`, `Implementation`, `BuiltDAG`, `TriggerRule`, and the rest of the public contracts.

## Build

`sdk` is a Bun workspace package. `bun run build` bundles the internal packages with `tsdown`; `bun run test` checks the public surface and the authoring/build flow.

The package is pre-release (`0.0.0`). It describes and validates graphs; it does not execute them or persist them. The persistence schema lives in the source-only `@badag/db-schema` package.
