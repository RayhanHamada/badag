# Core is one package; dialects stay separate

**Status**: accepted

`@badag/core` owns the task-agnostic graph primitive and DAG builder. `@badag/graph` and `@badag/dag` are merged into it. `@badag/dag-airflow` remains a separate dialect, and `@badag/sdk` bundles both.

## Context

ADR 0011 split the stack into `graph`, `dag`, `airflow`, and `sdk` to make the dependency direction visible. The graph/dag seam is not an independently shipped or independently consumed interface:

- Both packages are private workspace packages; only `@badag/sdk` is published.
- Every consumer imports both.
- The split adds two manifests, two tsconfigs, two vitest configs, and two package entries without an adapter or a separate release.

## Decision

- Merge `@badag/graph` and `@badag/dag` into `@badag/core`.
- Keep the layers as `src/graph` and `src/dag` with one dependency direction: `dag` may import `graph`, never the reverse.
- Export both layers from the package root.
- `@badag/dag-airflow` depends on `@badag/core` only.
- `@badag/sdk` bundles `@badag/core` and `@badag/dag-airflow`.
- Remove the old package names. No compatibility shims.

## Consequences

- One fewer package boundary and one fewer set of package configuration.
- The graph/dag layering remains enforced by source layout and tests, not by package resolution.
- Workspace imports change from `@badag/graph` and `@badag/dag` to `@badag/core`; the published SDK surface does not change.
- If the graph layer ever needs independent publication, it can be extracted again. There is no consumer or release pressure for that today.

## Considered options

- **Keep both packages and add `@badag/core` as an aggregate.** Rejected: it increases the package count instead of reducing it, and the aggregate would be a pass-through.
- **Merge `@badag/dag-airflow` into core.** Rejected: Airflow vocabulary changes independently and must remain swappable for future dialects.
- **Move graph and dag into `@badag/sdk`.** Rejected: the dialect depends on core, and the SDK is the publisher, not the core implementation.
