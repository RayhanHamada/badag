# Roadmap

Internal planning notes for `@badag/*`. This file is not published API documentation; the READMEs describe only what ships today.

## Planned: `DAG.chain()` wiring API

**Status:** deferred. `DAG.chain()` was removed from `@badag/core` for now. No release target is set.

### Planned shape

`chain()` accepted one or more wiring sets as positional arguments and linked consecutive sets, every member to every member:

```ts
const dag = createDAG("etl")
    .chain(extract, transform, load) // extract -> transform -> load
    .chain(extract, [cleanA, cleanB], join) // fan out, then fan in
    .chain([extract, load]); // registers both, adds no edge
```

Planned behavior:

- Wiring sets may contain `DAGTask` handles or task definitions; definitions are registered before linking.
- A single wiring set registers its tasks without adding edges.
- Existing edges are skipped, so repeated calls are idempotent.
- Each call is transactional: a rejected task, edge, or wiring step rolls back the tasks and edges added by that call.
- The call returns the DAG so calls compose.

### Planned compile-time checks

`chain()` carried graph state in the DAG type. Reintroducing it means restoring:

- an `Edges` type parameter on `DAG` alongside `Signatures` and `Branches`;
- type-level duplicate-definition detection by task id and inferred callback signature;
- type-level self-edge and cycle detection over consecutive wiring sets;
- type-level declared-branch routing for branch tasks;
- the existing bounded type-level walk (up to 40 positional wiring sets), with wider or `string`-widened values falling back to runtime validation.

Runtime validation is authoritative and must cover every case even when the static checks opt out.

### Why it is deferred

The type-level edge state was the most complex part of the package: a separate `Edges` parameter, a cycle walk, and a branch-routing walk all keyed off literal inference that TypeScript only partially provides. `parse()` already covers runtime-validated wiring, and `addDependency()`/`addDependencies()` cover dynamically assembled graphs. Deferring `chain()` keeps the public surface and the DAG type smaller until the runtime and scheduler requirements settle.

`parse()` deliberately does not record edges in the DAG type: TypeScript cannot read the literal `>>`/`<<` segments, so any edge state written by `parse()` would be guesswork and would make a future `chain()` cycle check silently weaker. See [ADR 0006](./adr/0006-bitshift-notation-is-runtime-validated.md).

### Current alternatives

- Airflow bitshift notation: `dag.parse\`${a} >> ${b} >> ${c}\``, with wiring sets as operands (`${[a, b]} >> ${c}`).
- Pairwise wiring: `dag.addDependency(a, b)` or `dag.addDependencies([a, b], [c, d])`.
- Bipartite linking across handles: `crossDownstream([a, b], [c, d])`.

### Reintroduction checklist

- [ ] Restore the runtime semantics above, including rollback and idempotency.
- [ ] Restore the `Edges` type parameter and the bounded static checks.
- [ ] Port the removed `chain()` test suite (runtime and compile-time).
- [ ] Keep `parse()` behavior unchanged: same runtime checks, no edge state.
- [ ] Document the relationship between `chain()` and `parse()`, including which one provides compile-time cycle detection.
- [ ] Revisit [ADR 0005](./adr/0005-branch-tasks-declare-names-not-tasks.md) and [ADR 0006](./adr/0006-bitshift-notation-is-runtime-validated.md), which describe compile-time branch checks and parse's missing edge state in terms of `chain()`.

### Open questions

- Name: `chain()` was the working name; `wire()` or `link()` may read better once `parse()` is the primary notation.
- Group limit: keep 40 positional wiring sets, or lower it if the type-level walk is too expensive.
- Type-state interaction: should a future `chain()` trust signatures registered by `parse()`, and should `parse()` opt out of edge checks explicitly rather than by omission?
- Whether `chain()` should accept the same flat wiring-set operands as `parse()`.

## Related vocabulary

- **Wiring set**: a flat list of tasks used as one endpoint of complete-bipartite wiring. See [ADR 0002](./adr/0002-task-group-reserved-for-airflow-grouping.md).
- **Declared branches**: the branch names a branch task promises to route to. See [ADR 0005](./adr/0005-branch-tasks-declare-names-not-tasks.md).
