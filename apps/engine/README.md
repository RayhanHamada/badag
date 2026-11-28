# @badag/engine-api

The Badag engine: a regular Cloudflare Worker that serves the public `/api/v1` REST API and exports the Durable Object and Workflow classes its bindings reference. D1, the Worker Loader, the orchestrator Durable Object, Workflows, and the OpenAPI/oRPC stack all live here; the dashboard is only a client.

## Local development

Install from the repository root:

```sh
bun install
```

Node.js `22.18+` must be on the `PATH` for the `cf` CLI.

Apply the main-database migration, then start the Worker:

```sh
cd apps/engine
bun db:migrate
bun dev
```

`bun dev` delegates to `cf dev` and serves the Worker on <http://127.0.0.1:8787>. Requests outside `/api/v1` answer `404`; the API health check is at `/api/v1/health` and the Scalar docs at `/api/v1/docs`.

Run `bun db:clean-generate` only when the schema is unreleased, then `bun db:migrate` again.

## Scripts

| Script | What it does |
| --- | --- |
| `dev` | `cf dev` with local bindings on `127.0.0.1:8787` |
| `build` | `cf build` → Build Output in `.cloudflare/output/` |
| `deploy` | `cf deploy`, build and upload to Cloudflare |
| `typecheck` | `cf workers types` then `tsrs --noEmit --fast` |
| `db:generate` | Generate Drizzle SQL for both databases into `migrations/` |
| `db:clean-generate` | Delete `migrations/` and regenerate both databases |
| `db:migrate` | Apply `migrations/main-db` to the local D1 database |

## Bindings

Declared in `cloudflare.config.ts`:

| Binding | Type | Use |
| --- | --- | --- |
| `MAIN_DB` | D1 | DAGs, revisions, tasks, edges, and runs |
| `LOADER` | Worker loader | Loads generated dynamic worker modules |
| `TASK_ORCHESTRATOR_DO` | Durable Object (`TaskOrchestratorDO`) | Orchestrator state in Durable Object SQLite |
| `DYNAMIC_WORKFLOW` | Workflow (`DynamicWorkflow`) | Single dispatcher Workflow for dynamically loaded modules |

`MAIN_DB` is bound to the placeholder id `00000000000000000000000000000000`, which keeps local development anonymous. Replace it with a real database id before deploying.

## Exports

| Export | Kind | Notes |
| --- | --- | --- |
| `TaskOrchestratorDO` | Durable Object (`sqlite`) | Migrates `migrations/orchestrator-db` in its constructor |
| `DynamicWorkflow` | Workflow (`dynamic-workflow`) | Dispatches every dynamically loaded worker run |

The Worker entry (`src/index.ts`) re-exports both classes as named module exports, which is what `cloudflare.config.ts` declares under `exports`.

## Source layout

| Path | Responsibility |
| --- | --- |
| `src/index.ts` | Worker entry: `/api/v1` fetch handler plus the named exports |
| `src/integrations/orpc/` | Public `/api/v1` oRPC app: OpenAPI procedures and Valibot schemas |
| `src/integrations/db/` | D1 Drizzle client and the Durable Object migration runner |
| `src/integrations/dynamic-worker/` | Universal Worker Loader integration: definition schema, content-addressed loader, and dispatcher factory |
| `src/integrations/exports/` | Durable Object and Workflow classes re-exported by the Worker entry |
| `cloudflare.config.ts` | Worker name, compatibility flags, bindings, and exports |
| `migrations/` | Drizzle-generated SQL for `main-db` (D1) and `orchestrator-db` (Durable Object SQLite) |

## Public API

Everything under `/api/v1` is served by the oRPC OpenAPI handler in `src/integrations/orpc/`. Procedures declare their HTTP metadata inline, Valibot validates inputs and outputs, and the OpenAPI 3.1 document is generated from those schemas.

- `GET /api/v1/health` — liveness check returning `{ "status": "ok" }`.
- `GET /api/v1/docs` — Scalar reference UI; the OpenAPI 3.1 document is at `/api/v1/docs/json`.

| Area | Endpoints |
| --- | --- |
| DAGs | `GET`/`POST /dags`, `GET`/`PATCH`/`DELETE /dags/{dagId}` |
| Tasks and edges | `GET`/`POST /dags/{dagId}/tasks`, `GET`/`POST /dags/{dagId}/edges` |
| Runs | `GET`/`POST /dags/{dagId}/runs`, `GET /runs`, `GET /runs/{runId}`, `POST /runs/{runId}/cancel` |
| Task executions | `GET /runs/{runId}/tasks`, `GET /runs/{runId}/tasks/{taskExecutionId}` |
| Schedules | `GET /schedules`, `GET`/`PUT`/`DELETE /schedules/{scheduleId}` |

`health` and the docs are implemented. The rest are declared with a Valibot response schema but answer `501 not_implemented` until the data access and orchestration logic lands. Request validation failures answer `422 invalid_request`. Errors share one shape:

```json
{ "code": "not_implemented", "message": "…" }
```

## Dynamic workers

`src/integrations/dynamic-worker/` is feature-agnostic infrastructure: a definition schema, a content-addressed `LOADER.get()` wrapper, and the `DynamicWorkflow` dispatcher. A feature supplies module sources through `defineDynamicWorker()`, loads the worker, and lets it call its wrapped Workflow binding; the dispatcher rebuilds the same module from the run metadata. No HTTP route currently uses it.

## Migrations

Both schemas live in the internal `@badag/db-schema` package, so the migrations are generated from that source:

```sh
bun db:generate:main   # main-db → migrations/main-db
bun db:generate:do     # orchestrator-db → migrations/orchestrator-db
```

`TaskOrchestratorDO` migrates `migrations/orchestrator-db` inside the Durable Object constructor, so the orchestrator schema needs no separate apply step. Apply the D1 schema explicitly with `bun db:migrate` locally, or `cf d1 migrations apply <DATABASE_ID> --dir migrations/main-db` remotely.

## Deploy

1. Replace the placeholder D1 id in `cloudflare.config.ts` with the real database.
2. Apply the schema remotely: `cf d1 migrations apply <DATABASE_ID> --dir migrations/main-db`.
3. Run `bun deploy` (it builds first; add `--prebuilt` to reuse existing Build Output).

## Repository

Part of the [Badag](../../README.md) workspace. The dashboard that consumes this API lives in [`apps/dashboard`](../dashboard).
