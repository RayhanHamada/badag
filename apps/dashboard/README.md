# @badag/dashboard

The Badag web app: a TanStack Start (React 19) dashboard served by a Nitro v3 server. The dashboard owns rendering, static assets, and the browser-facing server; all Cloudflare infrastructure and the public REST API live in the sibling [`apps/engine`](../engine) Worker.

The overview and activity pages render static demo data from `src/features/dashboard/data.ts`. Requests to `/api/v1` are proxied by the Nitro server to the engine.

## Requirements

- Bun `1.4.4` (the workspace package manager).
- Node.js `22.22+` on the `PATH` (Nitro's minimum).
- The engine running for the public API and its documentation.

## Local development

Install from the repository root so the workspace packages resolve:

```sh
bun install
```

Start the engine first:

```sh
cd apps/engine
bun dev
```

Then start the dashboard in another terminal:

```sh
cd apps/dashboard
bun dev
```

`bun dev` runs `vite dev`; the Nitro plugin serves both the app and the server. The dashboard overview is the root page and activity lives at `/activity`. In development the `/api/v1` proxy targets `http://127.0.0.1:8787`; override it with `NITRO_ENGINE_URL`.

## Scripts

| Script | What it does |
| --- | --- |
| `dev` | `vite dev` with the Nitro server on the Vite dev port |
| `build` | `vite build` → Nitro output in `.output/` |
| `preview` | Preview the production build through Nitro |
| `start` | Run the built Node server from `.output/server/index.mjs` |
| `generate-routes` | Regenerate `src/routeTree.gen.ts` with `tsr` |
| `typecheck` | `tsrs --noEmit --fast` |
| `test:e2e` | Vitest + Playwright suite in `e2e/` |

## Source layout

| Path | Responsibility |
| --- | --- |
| `server/routes/api/v1/[...path].ts` | Nitro proxy from `/api/v1` to the engine Worker |
| `src/routes/` | File-based TanStack Router routes for the dashboard pages |
| `src/features/dashboard/` | Overview and activity components, hooks, and demo data |
| `src/integrations/tanstack-query/` | Query client context and SSR bridging |
| `src/lib/theme.ts` | Light/dark preference: storage, document class, and the pre-paint head script |
| `src/components/ui/` | shadcn (Base UI) primitives; configured in `components.json` |
| `src/server.ts` | TanStack Start SSR entry loaded by Nitro |
| `nitro.config.ts` | Nitro server config and the engine URL runtime setting |
| `vite.config.ts` | Vite, TanStack Start, Tailwind, and the Nitro plugin |

## Engine proxy

The dashboard never talks to D1, Durable Objects, Workflows, or the Worker Loader. `server/routes/api/v1/[...path].ts` forwards every `/api/v1` request to the engine so the browser keeps a same-origin API and the deployment boundary stays explicit.

| Environment | `NITRO_ENGINE_URL`                                |
| ----------- | ------------------------------------------------- |
| Development | `http://127.0.0.1:8787` (default)                 |
| Production  | Required; the proxy answers `503` until it is set |

## Public API

The engine owns the OpenAPI contract. Through the proxy:

- `GET /api/v1/health` — liveness check returning `{ "status": "ok" }`.
- `GET /api/v1/docs` — Scalar reference UI; the OpenAPI 3.1 document is at `/api/v1/docs/json`.

| Area | Endpoints |
| --- | --- |
| DAGs | `GET`/`POST /dags`, `GET`/`PATCH`/`DELETE /dags/{dagId}` |
| Tasks and edges | `GET`/`POST /dags/{dagId}/tasks`, `GET`/`POST /dags/{dagId}/edges` |
| Runs | `GET`/`POST /dags/{dagId}/runs`, `GET /runs`, `GET /runs/{runId}`, `POST /runs/{runId}/cancel` |
| Task executions | `GET /runs/{runId}/tasks`, `GET /runs/{runId}/tasks/{taskExecutionId}` |
| Schedules | `GET /schedules`, `GET`/`PUT`/`DELETE /schedules/{scheduleId}` |

`health` and the docs work. The rest are declared with a Valibot response schema but answer `501 not_implemented` until the data access lands. Request validation failures answer `422 invalid_request`. Errors share one shape:

```json
{ "code": "not_implemented", "message": "…" }
```

## End-to-end tests

```sh
bun run test:e2e
```

Vitest drives Playwright against two servers that `e2e/global-setup.ts` starts: the engine on `127.0.0.1:8787` and the dashboard on `127.0.0.1:3100`. Each run writes `reports/vitest-e2e-junit.xml`. The suite asserts that the overview renders at `/`, activity renders at `/activity`, and the public API health check responds through the proxy without credentials.

## Deploy

`bun run build` produces a standard Nitro `.output/` directory. Run it with Node (`bun run start`) or apply a Nitro deployment preset. Point `NITRO_ENGINE_URL` at the deployed engine Worker before starting the server.

## Repository

Part of the [Badag](../../README.md) workspace. Cloudflare bindings, exports, and the public API live in [`apps/engine`](../engine).
