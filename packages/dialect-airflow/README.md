# @badag/dialect-airflow

The first Badag dialect, layered over `@badag/core`. It adds six node presets, trigger-rule names, the `>>` / `<<` wiring notation, the `validate_key` convention, and dialect findings. It compiles to the same graph spec as everything else: no Airflow concept leaks into `@badag/core`, and future dialects can target that same spec.

## Import

```ts
import {
    branch,
    createDAG,
    delay,
    sensor,
    shortCircuit,
    task,
    trigger,
} from "@badag/dialect-airflow";
```

## Presets are roles

| Preset         | Type            | Role      | Config                       |
| -------------- | --------------- | --------- | ---------------------------- |
| `task`         | `task`          | `compute` | metadata only                |
| `branch`       | `branch`        | `router`  | `branches`                   |
| `sensor`       | `sensor`        | `waiter`  | `pokeIntervalMs`             |
| `delay`        | `delay`         | `waiter`  | `durationMs`                 |
| `shortCircuit` | `short_circuit` | `router`  | `branches: ["run", "skip"]`  |
| `trigger`      | `trigger`       | `compute` | `dagId`, `waitForCompletion` |

Every preset accepts `description`, `config`, and `triggerRule`; `task` also accepts `output`. `triggerRule` is stored only when supplied; the dialect exposes `all_success` as the default name, but the SDK does not apply it.

Each preset returns its own config type (`TaskConfig`, `BranchConfig`, `SensorConfig`, `DelayConfig`, `ShortCircuitConfig`, `TriggerConfig`), so `node.config` exposes the keys that preset writes.

`delay` and `trigger` may omit code; their behavior is execution-defined. A declaration without an implementation still enters the spec.

## Wiring

```ts
const dag = createDAG("pricing").parse`${source} >> ${extract} >> ${route}`
    .parse`${route} >> ${[us, eu]}`.parse`${[us, eu]} >> ${publish}`;
```

- One expression per call. A newline, leading or trailing text, an empty list, a nested list, or a non-task operand is rejected.
- `>>` points from left to right; `<<` points back.
- An edge **out of a router** (`branch` or `short_circuit`) carries the target's key as its label. Every other edge is unlabeled. Route labels and node keys are one vocabulary; there is no label override.
- Repeating a statement is legal when the same definition is supplied again; a different definition under the same key throws.

## Findings

`checkAirflow(spec)` returns dialect findings; `check(spec)` returns `checkSpec(spec)` followed by `checkAirflow(spec)`. Codes are kebab-case:

`invalid-dag-id`, `invalid-node-key`, `duplicate-declared-branch`, `invalid-declared-branch`, `unrouted-branch`, `undeclared-branch-target`, `self-trigger`.

A branch that declares no labels is unconstrained. A branch that declares labels must route every one of them, and may not route anything else.

## Behavior change from the old SDK

Keys are validated as written. The old factories trimmed surrounding whitespace; a padded key now fails the Airflow convention instead of being normalized.
