# @badag/dag

The task layer over `@badag/graph`. A node is a key, an open type, open JSON config, and an implementation. While authoring, both channels travel together; `build()` splits them into a frozen spec and a registry keyed by node key.

The package knows nothing about Airflow: `type` is an open string, `config` is open JSON, and the implementation is any callable.

## Import

```ts
import { createDAG, defineNode } from "@badag/dag";
```

## Quick start

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

spec; // { specVersion, key, revision, nodes, edges }
implementations.get("extract"); // extract.implementation
```

## Two channels, one key

- The **spec** is pure data: node key, type, config, and edges. It is frozen, contains no functions, and serializes.
- The **implementations** are build-local code keyed by node key. They never enter the spec.
- A node key is the only join between the two. `build()` returns a copy of the registry, so later builder changes cannot alter a built artifact.

`resolve(key)` returns `undefined` when a key has no implementation. A declaration without code is legal; the runtime decides whether that is a dispatch error.

## Typing

`input` and `output` are Standard Schemas. They type the callback; the SDK never applies them.

```ts
const extract = defineNode({
    key: "extract",
    type: "task",
    input: z.object({ url: z.string() }),
    output: z.array(z.number()),
    run: (ctx) => fetchPrices(ctx.payload.url), // ctx.payload: { url: string }
}); // run must return number[] | PromiseLike<number[]>
```

Without an input schema `ctx.payload` is `undefined`; without an output schema the result is `unknown`.

## Transactions

`add`, `addAll`, `link`, and `apply` are atomic. A duplicate node key throws before anything is written, in the DAG or in the same batch. A rejected graph change (unknown endpoint, self edge, cycle) registers no implementation, and a rejected batch leaves neither channel changed.

## Bound

This package depends on `@badag/graph` only. Presets, notation, and activation policies belong to `@badag/airflow`; scheduling belongs to `@badag/runtime`.
