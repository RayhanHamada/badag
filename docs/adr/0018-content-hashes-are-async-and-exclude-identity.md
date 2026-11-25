# Content hashes are async and exclude identity

**Status**: accepted

Every node definition exposes `hash(): Promise<string>`, and a DAG exposes the same shape over its registered tasks. The hash answers "what does this task do, and did it change?" without executing the callback and without becoming an identifier. It is computed lazily on first call, cached on the definition, and uses SHA-256 through Web Crypto because that digest exists in every runtime Badag targets: Node, Bun, browsers, and Cloudflare Workers.

## Decision

- A task hash covers the node's **type**, its **config with `description` removed**, and its **behavior source**. The source is `run.toString()` by default; a preset passes `hashSource` when the registered callback is a generated wrapper and the real behavior sits in an option (`shortCircuit` uses `condition.toString()`).
- The task **key** and **description** never enter the hash. Renaming or relabeling a task is not a content change. The output schema is also excluded: schemas are code the SDK never applies (ADR 0004) and have no canonical serialization.
- The canonical form sorts object keys at every level before hashing, so config key order is irrelevant. Arrays keep their order.
- A DAG hash is the hash of its task hashes sorted lexicographically. Registration order and task names do not affect it. Names and topology remain the job of the spec `revision`, which stays synchronous and data-only (ADR 0010).
- `DAG.hash()` reflects current registrations; `BuiltDAG.hash()` captures the task set at `build()` time and does not change when the builder mutates.
- The hash is not identity. Task identity remains the declared key (ADR 0009); a hash never replaces or rewrites a key.

## Consequences

- Changing a callback's source text changes its hash; minification changes every hash in a build. A hash is therefore build-local, like the old source-derived identity (ADR 0003), and must not be used as a durable task id.
- Closures that differ only in captured values share source text and therefore share a hash. The hash detects source edits, not captured-state differences.
- Hashing is asynchronous, so callers await it: `await task.hash()`, `await dag.hash()`, `await built.hash()`. Authoring and registration remain synchronous; no digest starts until the first call.
- `spec.revision` and the DAG hash answer different questions: revision covers names, types, config, and edges as data; the DAG hash covers task behavior and config across the whole DAG.

## Considered options

- **Make the definition factories async.** Rejected: registration is synchronous and has no IO, and forcing every module to await construction would complicate authoring for a value many callers never need.
- **A `Promise` property computed eagerly.** Rejected: it starts a digest for every definition at import time and can leave an unhandled rejection when a caller never reads it.
- **Reuse the synchronous FNV-1a revision hash.** Rejected: revision identity is a separate concern, and a non-cryptographic digest of source text is weaker than Web Crypto already available in every target runtime.
- **Include the task key in the hash.** Rejected: the key is a name, not content, and putting it in the hash would make a rename invalidate caches for unchanged behavior.
- **Include edges in the DAG hash.** Rejected: topology is already revision identity; mixing it in would make the DAG hash change for wiring-only edits and would reintroduce task names as hash input.
