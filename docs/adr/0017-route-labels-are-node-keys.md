# Route labels are node keys

**Status**: accepted

The notation has one vocabulary: an edge out of a router is labeled with the target node's key, and there is no label override. `labeled` and its operand types are removed; a wiring operand is a task or a flat list of tasks.

## Context

ADR 0012 introduced an explicit edge label and a `labeled(label, node)` override so a route name would not dictate a node's identity. That added a second vocabulary to the authoring surface and made `${[task1, task2]}` insufficient whenever a target's key differed from a declared route. The dialect chooses the single-vocabulary form: route names and node keys are the same string, matching the older `${[task1, task2]}` form.

## Decision

- Remove `labeled`, `LabeledOperand`, and `NotationOperand`.
- A `WiringOperand` is a node definition or a flat list of node definitions.
- An edge out of a router carries the target's key as its label; every other edge is unlabeled.
- A branch's declared labels name target node keys. Existing branch findings remain and surface a declaration that has no matching outgoing edge.
- Core keeps `GraphEdge.label`: the graph layer is dialect-agnostic, and `DAG.link(from, to, label)` can still set an arbitrary label. `checkAirflow` reports `label-key-mismatch` when a labeled edge's label differs from its target key.

## Consequences

- A router's edges are authored with node sets, for example `${route} >> ${[us, eu]}`; those keys are the route names.
- Two route labels cannot target one node through notation. Use distinct nodes, or `DAG.link` if the spec genuinely needs parallel labels.
- Route labels remain data in the spec and the runtime's activation semantics are untouched. The dialect check reports a hand-built or `DAG.link` spec that pairs a label with a differently keyed target.
- The decoupling promised by ADR 0012 is withdrawn at the dialect level.

## Considered options

- **Keep `labeled`**: rejected — two vocabularies for one identity.
- **Remove `label` from `GraphEdge`**: rejected — core is dialect-agnostic and activation consumes labels; routers would have to infer them from targets at runtime.
- **Keep `labeled` but reject it in sets**: rejected — the override itself is the complexity.

## Revisit triggers

- A route name must differ from a node key again.
- Stored specs must accept label–key divergence without a finding.
