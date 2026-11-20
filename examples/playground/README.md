# Playground

Runnable sandbox for `@badag/sdk`. It authors a daily-pricing DAG with the Airflow dialect, prints the frozen spec, and executes it in memory.

## Run

From the repository root:

```sh
bun install
bun run --cwd examples/playground start
```

`start` rebuilds `@badag/sdk` first, so the playground uses the current workspace source.

Select the other branch:

```sh
REGION=eu bun run --cwd examples/playground start
```

## Edit

- `src/pipeline.ts` — the DAG: sensor, task, branch, retries, and trigger rules.
- `src/index.ts` — the CLI harness: `check()`, `dag.build()`, and `run()`.

The runtime is in-memory and persists nothing.
