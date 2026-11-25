# @badag/core

The task-agnostic core: a graph primitive plus a DAG builder over it. Nodes carry a key, an open type, and open JSON config. Edges are directed and may carry a route label. Core owns adjacency, topological order, transactionality, structural findings, the versioned spec, node definitions, and the implementation registry. It has no Airflow vocabulary.

The package keeps two internal layers with one dependency direction:

- `graph` — nodes, edges, ordering, cycles, structural findings, and the spec.
- `dag` — definitions over the graph, schemas, implementations, and `build()`.

## Import

```ts
import { checkSpec, createDAG, createGraph, defineNode } from "@badag/core";
```

## Graph primitive

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

## DAG builder

```ts
const extract = defineNode({
    key: "extract",
    type: "task",
    config: { retries: 2 },
    run: async () => "raw",
});

const load = defineNode({
    key: "load",
    type: "task",
    run: async () => "stored",
});

const dag = createDAG("etl").add(extract).add(load).link("extract", "load");
const { spec, implementations } = dag.build();

checkSpec(spec); // []
implementations.get("extract"); // extract.implementation
```

`build()` splits the two channels:

- The **spec** is pure data: node key, type, config, and edges. It is frozen, contains no functions, and serializes.
- The **implementations** are build-local code keyed by node key. They never enter the spec.
- A node key is the only join between the two. `build()` returns a copy of the registry, so later builder changes cannot alter a built artifact.

`resolve(key)` returns `undefined` when a key has no implementation. A declaration without code is legal; nothing in this package requires an implementation.

## Mutations are transactions

`addNodes`, `add`, `addAll`, and `link` plan the whole change, validate it, then write. A rejected batch leaves no node, edge, or implementation behind. Edges are identified by `(from, to, label)`, so repeated wiring is a no-op.

`Graph._apply` and `DAG._apply` are the internal transaction primitives behind those methods; the underscore marks them as unsupported for direct use.

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

## Typing

`output` is a Standard Schema. It types the callback's return value; the SDK never applies it. The callback context carries only the node's declared key.

```ts
const extract = defineNode({
    key: "extract",
    type: "task",
    output: z.array(z.number()),
    run: () => fetchPrices(), // must return number[] | PromiseLike<number[]>
});
```

Without an output schema the result is `unknown`.

## Boundaries

Core does not know what a `type` means, what a label selects, or whether a node executes. Presets and notation belong to `@badag/dialect-airflow`; execution is not part of this stack yet.
