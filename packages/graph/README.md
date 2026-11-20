# @badag/graph

The task-agnostic graph primitive. Nodes carry a key, an open type, and open JSON config. Edges are directed and may carry a route label. The package owns adjacency, topological order, transactionality, structural findings, and a versioned spec — nothing else. It has no dependencies and no Airflow vocabulary.

## Import

```ts
import { checkSpec, createGraph, GRAPH_FINDING_CODE } from "@badag/graph";
```

## Quick start

```ts
const graph = createGraph("pricing");

graph.addNodes([
    { key: "extract", type: "task" },
    { key: "us", type: "task" },
    { key: "eu", type: "task" },
    { key: "publish", type: "task" },
]);

graph.link("extract", "us", "us");
graph.link("extract", "eu", "eu");
graph.link(["us", "eu"], "publish");

graph.order(); // ["extract", "us", "eu", "publish"]
graph.spec(); // { specVersion: 1, key, revision, nodes, edges }
```

## Mutations are transactions

`addNodes`, `link`, and `apply` plan the whole change, validate it, then write. A rejected batch leaves no node and no edge behind. Edges are identified by `(from, to, label)`, so repeated wiring is a no-op.

- A node key is non-empty and unique. Re-adding an identical node is idempotent; re-adding the same key with a different type or config throws.
- An edge endpoint must exist, cannot be its own endpoint, and cannot close a cycle.
- A label is non-empty when present. Parallel edges between one pair with different labels are allowed.

## Structural findings

`checkSpec` is pure and never throws. It reports exactly four codes:

| Code             | Meaning                                               |
| ---------------- | ----------------------------------------------------- |
| `duplicate-node` | a node key appears more than once                     |
| `unknown-node`   | an edge endpoint is not declared                      |
| `self-edge`      | a node is its own endpoint                            |
| `cycle`          | following edges returns to a node already on the path |

A self edge is reported once, never also as a cycle. Each distinct cycle is reported once, at the back edge that closes it.

## Spec and revision

The spec is the only serializable form:

```ts
interface GraphSpec {
    specVersion: 1;
    key: string;
    revision: string;
    nodes: { key: string; type: string; config: Record<string, unknown> }[];
    edges: { from: string; to: string; label?: string }[];
}
```

Nodes and edges keep insertion order for display. `revision` hashes the canonical form — nodes sorted by key, edges by `(from, to, label)`, object keys sorted at every level — so declaration order and config key order never change it. The hash is FNV-1a 64-bit: a content identifier, not a cryptographic digest.

## Boundaries

The graph layer does not know what a `type` means, what a label selects, or whether a node executes. The layers above own that: `@badag/dag` registers implementations by key, and `@badag/airflow` supplies presets and notation. Execution is not part of this stack yet.
