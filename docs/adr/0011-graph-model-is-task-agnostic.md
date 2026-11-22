# The graph model is task-agnostic; Airflow vocabulary is a dialect

**Status**: accepted; package split superseded by ADR 0014

> Packaging update: ADR 0014 merges `@badag/graph` and `@badag/dag` into `@badag/core`. The task-agnostic layering below still applies.

`@badag/core` becomes three packages with one dependency direction. `@badag/graph` holds nodes, labeled edges, adjacency, ordering, cycle rejection, structural findings, and the spec. `@badag/dag` adds a task layer: a node carries a key, an open type, config, and an implementation reference. `@badag/dag-airflow` holds the Airflow vocabulary: six node presets, trigger-rule names, `>>` / `<<`, the `validate_key` id convention, and branch routing. Only `@badag/sdk` is published, and it re-exports the composition.

Node roles are three: **compute**, **router**, and **waiter**. Airflow's six task kinds are presets over those roles, not core categories.

## Context

Nearly every module in `packages/core` encodes an Airflow convention:

| Module | Convention |
| --- | --- |
| `airflow-key.ts` | Airflow's `validate_key`: `\p{L}\p{N}_.-`, at most 250 characters |
| `task/id.ts` | 25-member Unicode whitespace union modelling `trim()` at the type level |
| `task/trigger-rule.ts` | Seven Airflow trigger rules, stored but never evaluated |
| `task/sensor.ts` | `pokeIntervalMs`, Airflow's `poke_interval` |
| `task/*.ts` | Six task kinds, each an Airflow operator with its own executor contract |
| `dag/wiring.ts` | `>>` / `<<` notation |
| `dag/branch-routing.ts` | downstream task ids must equal declared branch names |
| `dag/violation.ts` | Five of eleven codes are dialect rules |

The coupling also runs the other way: `apps/dashboard` already declares its own graph contract (`key`, `name`, `type`, `config` plus edges) and speaks snake_case violation codes, and `packages/db-schema` stores a free-form `type`. Core matches neither consumer.

## Decision

- Layer dependency is one-way and mechanical: `graph` has no workspace dependencies, `dag → graph`, `airflow → dag`, `sdk → all three`. An import-boundary lint rule enforces it.
- The graph layer has no id convention beyond a non-empty unique key, no kind enum, no trigger rules, and no notation.
- Structural findings are four codes: duplicate key, unknown node, self edge, cycle. Dialect findings are separate and composed by the caller.
- The six Airflow kinds become presets: `branch` and `shortCircuit` are routers; `sensor` and `delay` are waiters; `task` and `trigger` are compute nodes, where `trigger` may suspend on the run it started.
- `Task kind` is renamed `Node role`.
- Airflow's key convention moves into the dialect; the persistence layer owns length limits.

## Consequences

- Core stops shipping executor instructions it cannot execute. `choose`, `predicate`, `condition`, and `dagId` stop being fields the graph stores and serializes away.
- New constructs (`switch`, `gate`, `join`, `wait`) are configuration over an existing role rather than new node types and new runtime paths.
- The Airflow authoring experience is preserved by the dialect and the SDK re-export, so the published import path does not change.
- ADR 0006's notation and ADR 0007's findings stay valid, but both move behind the dialect. ADR 0005 is superseded by ADR 0012.
- `packages/db-schema`'s `type` column maps directly to the node type; `key` maps to the node key; no second naming scheme is introduced.

## Considered options

- **Keep one package with internal folders.** Rejected: directory layering erodes under deadline pressure, while a package boundary is visible in review. The cost is two more manifests and two more `alwaysBundle` entries.
- **Keep the six kinds in core and add roles later.** Rejected: it keeps executor semantics in the graph model, which is the defect being removed.
- **Ship five packages (`core`, `dsl`, `compiler`, `runtime`, adapters).** Rejected for now: there is one authoring syntax and one compiler, so `dsl` and `compiler` are a hypothetical seam. `runtime` stays separate from day one because it carries different change pressure.
