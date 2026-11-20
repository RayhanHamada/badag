# The runtime reads roles, policies, and retries from node config

**Status**: accepted

A node's execution contract lives in its config, not in a new spec field. The runtime interprets exactly three keys — `role`, `triggerRule`, and `retries` — and treats every other config entry as opaque. `role` is `compute` (the default), `router`, or `waiter`; `triggerRule` is an activation-policy name defaulting to `all_success`; `retries` is a non-negative integer defaulting to `0`.

## Context

ADR 0011 established three node roles, and ADR 0012 made routing a runtime concern over labeled edges and activation policies. `GraphSpec` v1 was frozen with nodes of `{ key, type, config }`, so there is no dedicated role field, and `type` is deliberately free-form: the graph layer does not know what `branch` or `sensor` means. The runtime still has to distinguish a router from ordinary work before it can interpret a result.

## Decision

- `config.role` selects the execution path. A missing role means compute; an unknown role fails that node.
- `config.triggerRule` selects the activation policy. A missing policy means `all_success`; an unknown policy fails that node.
- `config.retries` bounds sequential retries. Invalid values fail that node.
- Policy names are the Airflow trigger-rule strings because that is the dialect's vocabulary. The graph layer stores the string and never switches on it.
- A router returns labels or explicit node keys; that selection algebra is ADR 0012's, not a config key.
- A node-level config problem fails the node and lets the rest of the run continue. Only a structurally invalid spec aborts the run.

## Consequences

- Adding a role or a policy does not change `GraphSpec`, so no spec version bump and no fixture churn.
- A custom node type becomes a router by setting `config.role`; the runtime never switches on `type`, so custom types need no runtime change.
- The contract is persisted with the graph and travels to the runtime without a side channel, which is what a replay from storage requires.
- A misspelled role or policy is a runtime failure, not a build failure. The dialect's factories validate the values they set; hand-built configs do not get that check.
- The runtime's role handling stays small: compute and waiter are both "await the implementation", and only the router has extra behavior.

## Considered options

- **Add `role` to `GraphNode`.** Rejected: it changes `GraphSpec` v1 and every golden fixture, couples the graph layer to execution semantics, and forces every producer to supply a field the graph never reads.
- **Derive the role from `type`.** Rejected: the runtime would need to know Airflow's six preset names, and a custom type could not become a router without a runtime change.
- **Pass a separate `roles` map to `run`.** Rejected: a spec loaded from storage would stop being self-describing, and the map would duplicate data the config already carries.
- **Put retries in a runtime option rather than config.** Rejected: retries are per node, not per run.
