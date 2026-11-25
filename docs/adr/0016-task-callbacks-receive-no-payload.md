# Task callbacks receive no payload

**Status**: accepted

The task layer types only the value a node produces. A callback receives its declared key and nothing else: `input` schemas, named `inputs`, `ctx.payload`, and the corresponding helpers and findings are removed.

## Context

ADR 0004 introduced optional input schemas to type `ctx.payload`; ADR 0015 then added named inputs for multiple upstream results. The graph allows multiple incoming edges, but an edge is readiness and route activation (ADR 0012), not a data channel, and the SDK defines no payload assembly contract. Because the SDK never applies schemas (ADR 0004), input typing was an unverified guess about a value the SDK does not construct. It also made every preset and callback generic over a payload that does not exist in this stack.

## Decision

- `NodeContext` carries only the node's declared key.
- `Implementation` carries only the optional `output` schema.
- `defineNode` and every preset drop `input` and `inputs`; `output` remains.
- `NodePayloadOf`, `NodeInputsOf`, `AnyInputSchemas`, `unknown-input-source`, and `invalid-declared-input` are removed.
- `checkAirflow` and the persisted dialect config drop declared input names.

## Consequences

- Callbacks type only what they return; they must narrow any runtime-supplied data themselves.
- The public surface loses input schema typing until a runtime defines a payload contract.
- ADR 0015 is withdrawn; ADR 0004's input half is superseded, while output schemas remain declared and unapplied.
- Removing the `ctx.payload` property is breaking for callbacks that read it.

## Considered options

- **Keep `input` as an untyped `unknown` payload**: rejected — it preserves a property the SDK cannot supply and forces every callback to narrow it.
- **Keep only named `inputs`**: rejected — it still guesses a runtime assembly contract and adds config vocabulary for it.
- **Move payload typing to the runtime**: not available; no runtime ships in this repository.

## Revisit triggers

- A runtime defines how payloads are assembled and validated; that contract should introduce its own context type.
- A dialect needs declared input names for scheduling rather than typing.
