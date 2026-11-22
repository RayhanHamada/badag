# @badag/dashboard

The Badag web app: a TanStack Start (React 19) dashboard running on Cloudflare Workers, with D1 for DAG and run records, a Durable Object for orchestration, and a Workflow for task execution.

The overview and activity pages render static demo data from `src/features/dashboard/data.ts`, while `/playground` runs real per-tenant dynamic Workflows. The remaining `/api/v1` domain handlers return `501`; the routes, schemas, and storage layout below are the seam the real data access plugs into.

## Requirements

- Bun `1.4.4` (the workspace package manager).
- Node.js `22.18+` on the `PATH` for the `cf` CLI.
- A Cloudflare account for `deploy`; local development needs no login.

## Local development

Install from the repository root so the workspace packages resolve:

```sh
bun install
```

Apply the main-database migration, then start the dev server:

```sh
cd apps/dashboard
bun db:migrate
bun dev
```

`bun dev` delegates to `vite dev` and serves <http://localhost:5173>. The dashboard overview is the root page; activity lives at `/activity`, and the Workflow playground at `/playground`. No credentials or environment variables are required.

Run `bun db:clean-generate` only when the schema is unreleased, then `bun db:migrate` again.

## Scripts

| Script | What it does |
| --- | --- |
| `dev` | `cf dev` → Vite dev server on `localhost:5173` with local bindings |
| `build` | `cf build` → Build Output in `.cloudflare/output/` |
| `preview` | `vite preview` of an existing build |
| `deploy` | `cf deploy`, build and upload to Cloudflare |
| `typecheck` | `cf workers types` then `tsrs --noEmit --fast` |
| `generate-routes` | Regenerate `src/routeTree.gen.ts` with `tsr` |
| `db:generate` | Generate Drizzle SQL for both databases into `migrations/` |
| `db:clean-generate` | Delete `migrations/` and regenerate both databases |
| `db:migrate` | Apply `migrations/main-db` to the local D1 database |
| `test:e2e` | Vitest + Playwright suite in `e2e/` |

## Source layout

| Path | Responsibility |
| --- | --- |
| `src/routes/` | File-based TanStack Router routes: dashboard pages and the API catch-alls |
| `src/features/dashboard/` | Overview and activity components, hooks, and demo data |
| `src/features/playground/` | Playground page, run panel, API client, and the workflow spec plus tenant module generator |
| `src/integrations/db/` | D1 Drizzle client and the Durable Object migration runner |
| `src/integrations/orpc/` | Public `/api/v1` oRPC app: OpenAPI procedures and Valibot schemas |
| `src/integrations/dynamic-worker/` | Universal Worker Loader integration: definition schema, content-addressed loader, and dispatcher factory |
| `src/integrations/exports/` | Durable Object and Workflow classes re-exported by the Worker entry |
| `src/integrations/tanstack-query/` | Query client context and SSR bridging |
| `src/lib/theme.ts` | Light/dark preference: storage, document class, and the pre-paint head script |
| `src/components/ui/` | shadcn (Base UI) primitives; configured in `components.json` |
| `src/server.ts` | Worker entry: TanStack Start handler plus the named exports |
| `cloudflare.config.ts` | Worker name, compatibility flags, bindings, and exports |
| `migrations/` | Drizzle-generated SQL for `main-db` (D1) and `orchestrator-db` (Durable Object SQLite) |

## Bindings

Declared in `cloudflare.config.ts`:

| Binding | Type | Use |
| --- | --- | --- |
| `MAIN_DB` | D1 | DAGs, revisions, tasks, edges, and runs |
| `LOADER` | Worker loader | Loads generated tenant workflow modules |
| `TASK_ORCHESTRATOR_DO` | Durable Object (`TaskOrchestratorDO`) | Orchestrator state in Durable Object SQLite |
| `DYNAMIC_WORKFLOW` | Workflow (`DynamicWorkflow`) | Single dispatcher Workflow that runs every tenant's code |

`MAIN_DB` is bound to the placeholder id `00000000000000000000000000000000`, which keeps local development anonymous. Replace it with a real database id before deploying.

`TaskOrchestratorDO` migrates `migrations/orchestrator-db` inside the Durable Object constructor, so the orchestrator schema needs no separate apply step. The D1 schema is applied explicitly with `bun db:migrate` (`cf d1 migrations apply … --local --persist-to .cloudflare/state`).

Both schemas live in the internal `@badag/db-schema` package, so the migrations are generated from that source:

```sh
bun db:generate:main   # main-db → migrations/main-db
bun db:generate:do     # orchestrator-db → migrations/orchestrator-db
```

## Dynamic workflow playground

`/playground` demonstrates running a different Workflow implementation per tenant from one `DYNAMIC_WORKFLOW` binding:

1. The page compiles a tenant id and ordered steps into an ES module (`tenant.js`) and sends it to `POST /api/v1/playground/runs`.
2. The API compiles the spec into a serialisable dynamic worker definition and loads it through `LOADER`, passing a `WORKFLOWS` binding wrapped with `wrapWorkflowBinding(definition)`. The tenant sees a normal Workflow binding.
3. The tenant calls `env.WORKFLOWS.create()`. The wrapped binding tags the persisted params with the worker definition.
4. The single `DynamicWorkflow` entrypoint from the universal `integrations/dynamic-worker` integration validates that definition, loads the same module, and forwards `run()` to its entrypoint.
5. `GET /api/v1/playground/runs/{runId}` polls the dispatcher's instance until it reaches `complete` or `errored`, then returns the tenant's step trace and output.

Changing the tenant or steps changes the generated module and the loader cache key, so each spec runs its own code without a deploy. The tenant only imports `cloudflare:workers`; the generated source is also rendered on the page.

`src/features/playground/workflow-spec.ts` is the single source for the spec schemas, the operation list, and `buildTenantModuleSource`; `src/features/playground/dynamic-worker.ts` turns a spec into the loader-independent worker definition. The dispatcher and loader under `src/integrations/dynamic-worker/` never import a feature.

## Public API

Everything under `/api/v1` is served by the oRPC OpenAPI handler in `src/integrations/orpc/`, mounted through the `src/routes/api/v1/$.ts` catch-all. Procedures declare their HTTP metadata inline, Valibot validates inputs and outputs, and the OpenAPI 3.1 document is generated from those schemas.

- `GET /api/v1/health` — liveness check returning `{ "status": "ok" }`.
- `GET /api/v1/docs` — Scalar reference UI; the OpenAPI 3.1 document is at `/api/v1/docs/json`.

| Area | Endpoints |
| --- | --- |
| DAGs | `GET`/`POST /dags`, `GET`/`PATCH`/`DELETE /dags/{dagId}` |
| Tasks and edges | `GET`/`POST /dags/{dagId}/tasks`, `GET`/`POST /dags/{dagId}/edges` |
| Runs | `GET`/`POST /dags/{dagId}/runs`, `GET /runs`, `GET /runs/{runId}`, `POST /runs/{runId}/cancel` |
| Task executions | `GET /runs/{runId}/tasks`, `GET /runs/{runId}/tasks/{taskExecutionId}` |
| Schedules | `GET /schedules`, `GET`/`PUT`/`DELETE /schedules/{scheduleId}` |
| Playground | `POST /playground/runs`, `GET /playground/runs/{runId}` |

The `Playground` endpoints are implemented; `health` and the docs work too. The rest are declared with a Valibot response schema but answer `501 not_implemented` until the data access lands. Request validation failures answer `422 invalid_request`. Errors share one shape:

```json
{ "code": "not_implemented", "message": "…" }
```

## End-to-end tests

```sh
bun run test:e2e
```

Vitest drives Playwright against a Vite dev server that `e2e/global-setup.ts` boots on `127.0.0.1:3100`; each run writes `reports/vitest-e2e-junit.xml`. The suite asserts that the overview renders at `/`, activity renders at `/activity`, the playground starts and completes a dynamic workflow at `/playground`, and the public API health check responds without credentials.

## Deploy

1. Replace the placeholder D1 id in `cloudflare.config.ts` with the real database.
2. Apply the schema remotely: `cf d1 migrations apply <DATABASE_ID> --dir migrations/main-db`.
3. Run `bun deploy` (it builds first; add `--prebuilt` to reuse existing Build Output).

## Repository

Part of the [Badag](../../README.md) workspace. The DAG SDK it manages lives in [`packages/sdk`](../../packages/sdk/README.md).
