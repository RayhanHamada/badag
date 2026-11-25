# Routing is route selection plus activation policy, not conditional edges

**Status**: accepted

**Superseded in part by** [ADR 0017](0017-route-labels-are-node-keys.md): an edge out of a router always carries the target key as its label; the labeled-operand override is removed.

An edge may carry a label. A router node selects the labels it activates and may also name non-adjacent node keys. The runtime carries the active route set forward through the graph until a node's activation policy consumes it, and that policy decides whether the node runs, is skipped, or waits. Joins are policies on ordinary nodes, not nodes of their own. The definition is never pruned: the executed graph is derived from the spec, the selected labels, and the recorded outcomes.

## Context

Today a branch is an executable task that also owns scheduling state, and its routing output is dropped by serialization. Routing is then enforced structurally: `dag/branch-routing.ts` requires the branch's direct downstream task ids to equal its declared branch names. That welds a route name to a node identity, so `route -> us` only works if the downstream task happens to be called `us`.

Airflow's branching is broader than immediate children, and its skip propagation plus trigger rules are what carry a decision to deeper targets. Reproducing that behavior by adding an edge to every possible target would change the graph itself. Reproducing it by pruning the definition at compile time would destroy reproducibility, because the executed graph could no longer be reconstructed from stored data.

## Decision

- An edge is `(from, to, label?)`. Ordering ignores labels. Parallel edges between one pair with different labels are allowed.
- In the `>>` notation an edge **out of a router** is labeled with the target node's key by default, and a labeled operand overrides it. Every other edge is unlabeled. The default is dialect sugar: the core spec never assumes a node key and a route label are the same string.
- An in-edge is **route-active** when it carries no label or its label is in the active route set. Route activity survives a skipped upstream: the token keeps propagating and skip is recorded as an outcome, not as a lost route. Each node's policy therefore evaluates the outcomes of its route-active in-edges, and a node whose route-active in-edges are all resolved is decided by that policy.
- A router returns the labels it activates, and may name node keys for targets that are not immediate.
- Each node carries an activation policy evaluated over its **route-active** incoming edges: `all_success`, `all_done`, `one_success`, `none_failed`, `none_failed_min_one_success`, `all_skipped`, plus any Badag-specific additions. The policy names live in the dialect and are stored as node config; the graph layer stores the config and never interprets it.
- A node with no route-active incoming edge is skipped. Skip is a terminal outcome and never becomes a failure.
- A join is an activation policy. `join()` remains available as dialect sugar.
- Graph cycles stay invalid. Loops and dynamic mapping are runtime scopes that instantiate parts of an acyclic definition, not cycles in the definition.

## Consequences

- Non-adjacent routing works without edges to every target, and without renaming nodes after branch names.
- Targeting a non-adjacent node requires that target's activation policy to tolerate skipped intermediates; `all_success` will not run across a skipped path. The dialect documents the compatible patterns.
- Reproducibility holds: a run is replayable from the spec revision, the router's selected labels, and the outcomes.
- `dag_edges` gains a `label` column and its primary key becomes `(dag_id, revision_id, from, to, label)`.
- Historical runs require immutable revisions, so `dag_runs` references a `dag_revision_id`.
- Airflow behavioral parity is explicitly not promised. The dialect documents a compatibility subset and Badag's own routing semantics; matching Airflow's exact skip propagation is a research task, not a copied specification.
- `shortCircuit` collapses into a router with two labels, and `branch` stops being a scheduler-owned task.

## Considered options

- **Conditional edges that prune the definition at compile time.** Rejected: the executed graph would no longer be derivable from stored data, violating reproducibility, and conditions remain adjacency-only.
- **Keep routing as a special task kind only.** Rejected: it mixes computation with orchestration and keeps the routing result unpersisted, which is the current defect.
- **Adopt Airflow's trigger rules verbatim as the activation algebra.** Rejected as a compatibility promise. The names are reused where their behavior matches, but skip propagation and branch interaction are defined by Badag and documented per policy.
