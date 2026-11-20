# Duplicate callbacks must be the same function instance

**Status**: Superseded by [ADR 0010](0010-graph-spec-and-implementations-are-separate-channels.md) for duplicate handling: implementations are registered separately from the spec, so a duplicate node key is an error regardless of callback identity. Identity itself was already declared by [ADR 0009](0009-task-id-is-declared.md).

A duplicate definition is reused only when its callable behavior is the same function reference. Two definitions in one DAG that share an id but hold different callback instances are rejected at registration instead of silently deduplicated.

A callback reference expresses captured values. A factory that returns `() => table` produces a different reference for every `table`, so the SDK can tell `syncTable("customers")` from `syncTable("orders")`. Treating the second definition as a duplicate would discard it; the graph typechecks and builds while one unit of work is missing. Silent loss is the failure worth removing, so the SDK stops at registration.

Two tasks with one id cannot coexist: a DAG indexes registered tasks by id, and an id is unique within its DAG. "Produce two tasks" is therefore never reachable for the reported shape. "Fail loudly" is the only acceptance the data model can honor, and it is chosen over a new id-scoped identity.

The check is scoped to callback kinds (`task`, `sensor`, `branch`, `short-circuit`), where a function reference can hide a closure. Declarative kinds (`delay`, `trigger`) carry every behavior-defining value as data, so equal values are equal behavior and still deduplicate. Metadata remains excluded: a duplicate definition still reuses the first registration's metadata, and there is no user-supplied identity escape hatch.

## Consequences

- Reusing one definition object, or reusing one callback reference across definitions, registers idempotently, including across DAGs. This preserves the cross-DAG reuse ADR 0009 relies on.
- Separate inline callbacks are not interchangeable duplicates. `task("x", { fn: (ctx) => ctx.id })` written twice throws; hoist the callback or reuse the definition. This is the cost of never silently dropping a closure.
- Bound functions are rejected for the same reason: every `bind()` result is a distinct callback reference.
- To run two capture-only-different behaviors, the ids must differ (`sync-customers`, `sync-orders`). The id remains the only identifier in a DAG.
- Task ids are declared and unaffected by this check; the callback reference is compared only when an id is already registered.

## Considered options

- **Explicit identity key on the definition.** It would add caller ceremony without making two same-id tasks possible, so it does not solve the acceptance on its own.
- **Detect differences through metadata.** Metadata is explicitly non-behavioral (ADR 0001); two definitions with equal behavior and different config are intended duplicates, so metadata cannot signal a different closure.
- **Structural comparison or execution.** ADR 0003 already rejected these: execution has side effects and nondeterminism, and closures cannot be compared portably.
- **Assign identity per registration.** The capture-only pair would get different IDs, then collide by name anyway, and cross-DAG idempotence would be lost.
- **Keep silent deduplication and document it.** Rejected: a missing task that typechecks is the exact failure being removed.
