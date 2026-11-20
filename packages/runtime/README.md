# @badag/runtime

The in-memory executor. It takes a built DAG — a spec plus implementations keyed by node key — and resolves it to a deterministic map of outcomes and an event log. No database, no network; retries are per node.

## Import

```ts
import { run } from "@badag/runtime";
```

## Quick start

```ts
const result = await run(dag.build());

result.outcomes.get("extract"); // { key, status: "succeeded", attempt: 1, value }
result.events; // started / succeeded / failed / skipped, in resolution order
```

`dag.build()` returns `{ spec, implementations }`; that is the whole input. Passing a hand-built spec works too.

## What a node run means

| Field | Meaning |
| --- | --- |
| `role` (config) | `compute` (default), `router`, or `waiter` |
| `triggerRule` (config) | activation policy; defaults to `all_success` |
| `retries` (config) | non-negative retry count; defaults to `0` |
| edge `label` | route label; an unlabeled edge is always route-active |

An edge is **route-active** when it is unlabeled or its label is in the run's active set. A node with no route-active incoming edge is **skipped** — terminal, never a failure. Skip activity still propagates, so a node behind a skipped intermediate can run when its policy tolerates it.

A **router** returns a string or an array of strings. A returned value is a route label when an outgoing edge carries it, and an explicit target when it names a node key. An unknown value fails the router. This is how Airflow's "branch to a non-adjacent task" works without an edge to every target: name the key, let the intermediate be skipped, and give the target a policy such as `all_done`.

A **waiter** is ordinary execution from the runtime's point of view: it suspends inside its implementation and resumes when that promise settles. Polling, timers, and external events belong to the implementation.

## Policies

`all_success`, `all_done`, `one_success`, `one_failed`, `none_failed`, `none_failed_min_one_success`, `all_skipped`.

Policy is evaluated over the outcomes of route-active incoming edges once they are resolved. A node with no incoming edge runs unconditionally. `all_skipped` requires at least one upstream.

## Outcomes and events

`OutcomeStatus` is `succeeded`, `failed`, `skipped`, or `cancelled` — terminal only. `attempt` is the attempt that produced the outcome: `1` unless `config.retries` allowed a retry. Scheduling states (pending, queued, running) are intentionally absent.

`events` contains `started`, `succeeded`, `failed`, and `skipped` records in resolution order; values live only in `outcomes`. Running the same spec with the same implementations produces the same events and outcomes.

## Retries

`config.retries` is a non-negative integer, default `0`. A failed attempt is retried in place, sequentially; each attempt emits its own `started` and `failed` events. The final outcome carries the attempt number that succeeded or the last attempt that failed. A retry is a new attempt, not a new status.

## Failure modes

- A structurally invalid spec (unknown endpoint, self edge, duplicate node, cycle) throws before anything runs.
- A node-level problem fails that node: no implementation, an unknown role, an unknown policy, or a bad router result.
- The runtime throws if it cannot make progress, which would indicate a broken spec.

## Not here

Payloads are `undefined` in this pass — cross-node data flow is deferred. No persistence, cancellation, or durable scheduling; those belong to the hosted runtime.
