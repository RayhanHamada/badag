<!-- Logo lives at ./logo.png beside this README. -->
<p align="center">
  <img src="./logo.png" alt="Badag logo" width="180" />
</p>

<h1 align="center">Badag</h1>

<p align="center">
  <strong>Strongly-typed DAGs.</strong><br />
  Author with a dialect, compile to a versioned spec.
</p>

<p align="center">
  <img alt="Tests" src="https://img.shields.io/github/actions/workflow/status/RayhanHamada/badag/ci.yml?label=tests" />
  <img alt="TypeScript strict" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" />
  <img alt="ESM only" src="https://img.shields.io/badge/module-ESM-F9A03C" />
  <img alt="MIT license" src="https://img.shields.io/badge/MIT-license-blue" />
</p>

Badag is a TypeScript SDK for describing and validating task graphs. Dialects supply the authoring vocabulary — the first is Airflow-inspired — and compile to one frozen JSON spec plus a registry of implementations.

> **The graph is data. Code is keyed by node. Dialects compile to the same graph.**

## Install

```sh
bun add @badag/sdk
```

ESM-only, ships declaration files, and bundles the core and Airflow packages. One install covers authoring, compilation, and validation.

## A graph in 30 seconds

Using the Airflow dialect, a daily pricing job: wait for the vendor drop, extract prices, route by region, publish after the selected region finishes.

```mermaid
graph LR
    S["source-ready<br/>sensor"] --> X["extract<br/>task"]
    X --> R["route<br/>branch"]
    R --> U["us<br/>task"]
    R --> E["eu<br/>task"]
    U --> P["publish<br/>task"]
    E --> P
```

```ts
import { branch, check, createDAG, sensor, task } from "@badag/sdk";

const sourceReady = sensor("source-ready", {
    predicate: () => true, // the vendor drop arrived
    pokeIntervalMs: 60_000,
});
const extract = task("extract", {
    run: async () => [
        { region: "us", price: 120 },
        { region: "eu", price: 110 },
    ],
});
const route = branch("route", {
    branches: ["us", "eu"] as const,
    choose: () => (process.env.REGION === "eu" ? "eu" : "us"),
});
const us = task("us", { run: () => "priced US" });
const eu = task("eu", { run: () => "priced EU" });
const publish = task("publish", {
    triggerRule: "none_failed_min_one_success",
    run: () => "published",
});

const pricing = createDAG("daily-pricing")
    .parse`${sourceReady} >> ${extract} >> ${route}`
    .parse`${route} >> ${[us, eu]}`.parse`${[us, eu]} >> ${publish}`;

check(pricing.spec()); // [] — structural and dialect findings

const { spec, implementations } = pricing.build();

spec.nodes.length; // 6
implementations.has("publish"); // true
```

`build()` splits the two channels:

- The **spec** is pure data — node keys, open types, JSON config, labeled edges, and a content revision. It is frozen, callback-free, and serializable.
- The **implementations** are build-local code keyed by node key. They never enter the spec.

The node key is the only join. A spec loaded from storage and a DAG built in memory cross the same seams: `check(spec)`, `orderSpec(spec)`, and `build()`.

## Dialects

`@badag/dag-airflow` is the first dialect, and the only one that ships today. It supplies the presets, `>>` / `<<` notation, Airflow key convention, and dialect findings documented below.

The core graph and task layers contain no Airflow vocabulary: `@badag/core` owns the spec, structural checks, and the implementation registry keyed by node. A future dialect — not yet built — can add its own presets, notation, and checks, then compile to the same `GraphSpec` v1. The spec keeps `role`, `triggerRule`, and `retries` as config data, so a future runtime can consume it without a spec change.

## Wiring

```ts
dag.parse`${a} >> ${b} >> ${c}`; // a -> b -> c
dag.parse`${a} >> ${b} << ${c}`; // a -> b, c -> b
dag.parse`${route} >> ${[us, eu]}`; // labeled edges us and eu
dag.parse`${route} >> ${labeled("us", processUs)}`; // explicit label
```

An edge **out of a router** defaults to the target's key as its route label. Every other edge is unlabeled. `labeled(label, node)` overrides the default, so a route name never dictates a node's key. Wiring is transactional: a rejected operand, label, edge, or duplicate leaves the DAG unchanged.

## Presets

Every preset accepts `description`, `config`, and `triggerRule`. `task` also accepts `input` and `output`; `branch`, `sensor`, `shortCircuit`, and `trigger` accept `input`; `delay` declares neither schema.

| Preset | Role | Config | Notes |
| --- | --- | --- | --- |
| `task` | compute | — | the work |
| `branch` | router | `branches` | selects route labels |
| `sensor` | waiter | `pokeIntervalMs` | predicate and interval |
| `delay` | waiter | `durationMs` | fixed wait |
| `shortCircuit` | router | `branches: ["run","skip"]` | two fixed labels |
| `trigger` | compute | `dagId`, `waitForCompletion` | targets another DAG |

Roles are config, not new node types: `role` is `compute`, `router`, or `waiter`. A custom type declares a router by setting `config.role`. `triggerRule` and `retries` are stored as config data for a future runtime; this SDK does not interpret them.

## Findings

`check(spec)` returns structural findings followed by dialect findings, each `{ code, subjects, message }`:

- Structural: `duplicate-node`, `unknown-node`, `self-edge`, `cycle`.
- Dialect: `invalid-dag-id`, `invalid-node-key`, `duplicate-declared-branch`, `invalid-declared-branch`, `unrouted-branch`, `undeclared-branch-target`, `self-trigger`.

## Packages

| Package | Responsibility |
| --- | --- |
| `@badag/core` | dialect-agnostic graph primitive and DAG builder: nodes, labeled edges, order, cycles, structural findings, the spec, implementation registry, `build()` |
| `@badag/dag-airflow` | first dialect: six presets, trigger-rule names, `>>` / `<<`, key convention, dialect findings |
| `@badag/db-schema` | Drizzle schemas: revision-scoped graphs and runs (`main-db`), task executions (`orchestrator-db`) |
| `@badag/sdk` | the published entry point for the Airflow dialect; bundles `@badag/core` and `@badag/dag-airflow` |

## Status

Pre-release (`0.0.0`). The SDK is the only published package; the others are source-only workspace packages. Airflow is the only dialect today; `@badag/core` carries no Airflow vocabulary, and the spec keeps `role`, `triggerRule`, and `retries` as config data, so future dialects can compile to the same spec. `@badag/db-schema` stores revision-scoped graphs: immutable revisions own the serialized spec, node rows, and labeled edges; runs reference a revision; task executions live in a second database. The SDK describes and validates graphs; it does not execute or persist them, and no execution runtime ships yet.
