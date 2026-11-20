# Playground

Runnable sandbox for `@badag/sdk`. It authors a daily-pricing DAG with the Airflow dialect and prints the frozen spec.

## Run

From the repository root:

```sh
bun install
bun run --cwd examples/playground start
```

`start` rebuilds `@badag/sdk` first, so the playground uses the current workspace source.

## Edit

- `src/pipeline.ts` — the DAG: sensor, task, branch, retries, and trigger rules.
- `src/index.ts` — the CLI harness: `check()` and `dag.spec()`.

The branch chooser is declared but never invoked; execution is out of scope for this playground.
