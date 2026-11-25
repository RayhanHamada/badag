# Task identity is the declared id

**Status**: accepted. [ADR 0018](0018-content-hashes-are-async-and-exclude-identity.md) adds content hashes as metadata; identity remains the declared id and no hash is used for it.

A task definition's id is supplied by the caller as the first argument to every factory. The factory trims and validates it against Airflow's `task_id` convention, the definition carries it, and registration stores exactly that id. Nothing derives or rewrites identity from behavior, and no hash is used for identity.

A DAG is identified only by its `dagId`; tasks are identified only by their `id`. The registered task map, `getTask()`, serialization edges, branch routing, and validation all use those ids. Callback contexts expose `{ id, payload }`, so there is no second name to keep in sync.

## Consequences

- Task ids are stable across builds. Minification no longer affects them, so they can be persisted or compared between runs.
- Removing hashing deletes the FNV-1a module and the behavior-source machinery. Identity is observable directly on the definition.
- Reusing an id in one DAG is accepted only when the definition describes the same behavior. Callback kinds compare callback references; declarative kinds compare the fields that determine what they do. Metadata is ignored, and the first registration wins.
- Reusing an id with different behavior throws. Distinct behaviors need distinct ids, so a capture-only pair such as `sync-customers` and `sync-orders` is deliberate rather than inferred from a hash.
- Cross-DAG reuse still works: the same definition carries the same id into every DAG, without per-registration identity.
- DAG ids and task ids are different namespaces: a task id is unique within one DAG, while a DAG id names the whole graph.
- The compile-time duplicate check tracks ids and inferred function types. Runtime remains authoritative for closures and declarative fields.

## Considered options

- **Keep hashing and expose the digest as `id`.** Rejected: it preserves an opaque, build-local identifier and keeps two names for every task while giving callers no stable value.
- **Use the declared name and keep the hash as an internal key.** Rejected: a second key is exactly what "id is the only identifier" removes; duplicate detection and edges would still have two sources of truth.
- **Require globally unique task ids across DAGs.** Rejected: ids are scoped to a DAG, so two independent graphs may both contain `extract`.
