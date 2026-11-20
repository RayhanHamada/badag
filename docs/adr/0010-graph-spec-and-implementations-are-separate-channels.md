# Graph spec and implementations are separate channels

**Status**: accepted

A compiled graph is pure data: a spec version, a DAG key, node entries of `key`, `type`, and `config`, labeled edges, and a content revision. The callbacks and schemas that execute nodes live in a separate registry keyed by `(dagKey, nodeKey)` and are never part of the spec. The node key is the only join between the two.

## Context

`@badag/core` keeps callbacks on task definitions and then drops them when serializing:

- `DAG.toJSON()` omits every function, so a snapshot names behavior it cannot rehydrate.
- `task/definitions.ts` carries two erased unions, `AnyTaskDefinition` and `RegisteredTaskDefinition`, only to move callbacks through registration.
- `task/identity.ts` compares callback references so a repeated id can mean "the same task" (ADR 0008).
- `packages/db-schema` persists `key`, `type`, `config`, and edges; there is nowhere to put a callback, and issue #3 records that a build-local identity and a durable key cannot both be true.

The split removes the reason for all of it. Declarations are data and persist; code is build-local and is resolved by key when a run dispatches.

## Decision

- The spec is `{ specVersion, key, revision, nodes, edges }`; nodes carry `key`, `type`, and an open JSON `config`; edges carry `from`, `to`, and an optional `label`.
- `revision` hashes the canonical form: nodes sorted by key, edges sorted by `(from, to, label)`. The spec keeps insertion order for display, so reordering independent declarations does not create a new revision.
- Implementations are registered separately: `(dagKey, nodeKey) → implementation`. An implementation carries the callable and any Standard Schema it declares. Schemas are code, not spec, because the SDK never applies them (ADR 0004) and the runtime loads implementations anyway.
- A duplicate node key inside one spec is an error. There is no behavior comparison and no "first registration wins".
- The bundle a DAG module compiles to exports both channels: the spec for persistence, and the implementation registry for execution.

## Consequences

- `dag.toJSON()` becomes a round-trippable spec instead of a lossy snapshot.
- Deleting the closures from identity deletes `sameTaskBehavior`, the erased definition unions, the `DAGIdRegistry` augmentation, and `TaskSchemas` / `TaskPayloadOf` / `TaskProducedOf` / `SchemaOf` from the graph layer.
- ADR 0008 is superseded: two definitions sharing a key is an error regardless of callback identity.
- A node whose implementation is missing fails at dispatch, which is the runtime's trust boundary, not the compiler's.
- The spec can be hashed into a revision, stored, diffed, and replayed without the source tree.
- Issue #3 closes with no ambiguity: the persisted key is the declared node key.

## Considered options

- **Keep callbacks on definitions and persist source text.** Rejected: source text is build-local (ADR 0003) and minification rewrites it, so a persisted callback cannot be re-executed or compared.
- **Serialize a reference such as a module path plus export name.** Rejected as the primary mechanism: it couples the spec to a bundler layout, while a key-based registry works for bundles, tests, and in-process runs alike.
- **Keep behavior comparison for duplicate keys.** Rejected: with implementations outside the spec, a repeated key inside one spec has no second behavior to compare; accepting it silently would hide a real authoring mistake.
