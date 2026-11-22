# RivetKit actors on Cloudflare Workers

Investigation date: **2026-11-22**. All package versions, doc pages and command
outputs in this document were observed on that date.

Scope: this is an evidence report. It answers whether RivetKit actors can run on
Cloudflare Workers, what the current adapter actually does, and whether one
actor definition can target both Rivet's native runtime and Cloudflare. It does
not propose a BaDAG design.

---

## 0. Premise correction: there are two adapter eras, and only one is current

The question "can RivetKit actors run on Cloudflare Workers with Durable Objects
as the underlying infrastructure" has **two different answers depending on the
package version**, because the Cloudflare integration was rewritten and the
Durable Object path was removed.

| Era | Package range | Mechanism | Durable Objects |
| --- | --- | --- | --- |
| **A** | `@rivetkit/cloudflare-workers` `0.9.x` – `2.2.1` | One generic `ActorHandler` DO class; actor key → `idFromName`; DO SQLite for actor KV | Yes, central |
| **B** | `@rivetkit/cloudflare-workers` `2.3.0` – `2.3.33` | WASM core runtime inside a plain Workers `fetch` handler; engine drives via `/api/rivet/start` | **No references at all** |

Era A's *mechanism* is constant, but its *export names* changed twice. Bisected
from `dist/mod.d.ts` of each tarball:

| Version | Exported entry points | Publish date |
| --- | --- | --- |
| `0.9.9`, `2.0.0` | `createServer`, `createServerHandler` (+ `Bindings`, `DriverContext`) | — |
| `2.0.10` – `2.0.23` | `createHandler` only (returns `{handler, ActorHandler}`) | — |
| `2.0.24` – `2.2.1` | `createInlineClient`, `createHandler`; `createActorDurableObject` is also exported from `2.0.30` (its `RunConfig` parameter becomes `getUpgradeWebSocket` by `2.0.35`) | `2.2.1` = 2026-04-02 |
| `2.3.0` – `2.3.33` | `setup`, `createHandler` only | `2.3.0` = 2026-06-15 |

Every era-A variant above exports a `DurableObjectConstructor` bound to the
hard-coded `ACTOR_DO` binding, so the mapping question is answerable uniformly
across `0.9.x`–`2.2.1`.

The boundary is pinned precisely:

- `@rivetkit/cloudflare-workers@2.2.1` (published `2026-04-02`) declares
  `interface ActorHandlerInterface extends DurableObject` and exports
  `createInlineClient`, `createHandler`, `createActorDurableObject`
  (`dist/mod.d.ts`).
- `@rivetkit/cloudflare-workers@2.3.0` (published `2026-06-15`) exports only
  `setup` and `createHandler`, and its dependencies become
  `rivetkit@2.3.0` + `@rivetkit/rivetkit-wasm@2.3.0` (no `hono`, no `zod`, no
  `invariant`, no `cloudflare:workers`).
- Verified mechanically: `rg -c "DurableObject|ActorHandler|ctx.storage|idFrom"`
  over the extracted `2.3.0` and `2.3.31` tarballs returns **no hits**.

`2.3.0`'s changelog confirms the intent: *"RivetKit now runs as either a native
Node.js module or as WebAssembly, so it can support more platforms like
Cloudflare Workers and Supabase Functions."*
(<https://rivet.dev/changelog/2026-06-15-introducing-rivet-2-3/>, accessed
2026-11-22.)

**Consequence for the original investigation questions.** The
"ActorHandler = one generic DO hosting many logical actors?" question is real and
answerable — for era A, from source. For the current published adapter it has no
subject: there is no DO mapping. Sections 3–5 therefore answer era A from source
and era B from source, and the matrices carry a column per era.

Additional version fact worth stating plainly: **`rivetkit` is at `3.1.1` but
`@rivetkit/cloudflare-workers` has never published a 3.x.** Its `latest` is
`2.3.31` (published `2026-10-27`) and its `next` tag is `2.3.33`
(`2026-11-21`). The adapter's dependency on `rivetkit` is an **exact pin**
(`"rivetkit": "2.3.31"`), not a peer range, so a Cloudflare deployment is pinned
to the 2.3 line regardless of the 3.x releases.

---

## 1. Summary

1. **The currently published Cloudflare adapter does not use Durable Objects.**
   `@rivetkit/cloudflare-workers@2.3.31` is a 151-line ES module that installs a
   `WebSocket` shim, configures RivetKit's WASM runtime, and forwards
   `/api/rivet/*` to `registry.handler(request)`. *Source-verified*
   (`dist/mod.mjs`, 4780 bytes).
2. **RivetKit actors do run on Cloudflare Workers today, but as a serverless
   runner driven by a Rivet engine**, not as a self-contained DO deployment.
   The engine polls `<managerPath>/metadata` and POSTs `<managerPath>/start`; a
   `RIVET_ENDPOINT` (namespace + token) is mandatory. *Source-verified* +
   *Documented* (`rivetkit@2.3.31` `Registry.handler`, and live
   `/api/rivet/metadata` returning `{"envoy":{"kind":{"serverless":{}}...}}`).
3. **The same `actor({...})` definition does run on both runtimes**, because the
   actor API is runtime-agnostic; only three things leak: the `setup` import
   (`rivetkit` vs `@rivetkit/cloudflare-workers`), the client construction, and
   the storage backend. *Source-verified*: `@rivetkit/cloudflare-workers`
   `setup()` is literally `rivetkitSetup({runtime:"wasm", wasm:{...}, noWelcome:true, ...config})`.
4. **SQLite is the hard seam.** The WASM runtime cannot use local SQLite; config
   validation rejects `{backend:"local"}` with *"WebAssembly runtime cannot use
   local SQLite"* and forces `{backend:"remote"}`, meaning every SQL statement is
   an RPC to the engine. *Source-verified* (`rivetkit` main,
   `src/registry/config/index.ts:316-331`).
5. **Era A's `db()` was broken, not merely backed by DO SQLite.** Running the
   `2.2.1` adapter under `wrangler dev` produced
   `Error: SqliteVfs instance not provided in context. The driver must provide a
   sqliteVfs instance.` The adapter's actor driver never implements
   `createSqliteVfs`. *Observed* (command output in §7.4).
6. **Era A mapped one logical actor to exactly one DO instance**, deterministically
   via `env.ACTOR_DO.idFromName(serializeNameAndKey(name, key))`, with
   `actorId = "<doIdHex>:<generation>"` where `generation` increments on
   resurrection of a destroyed actor. *Source-verified* (`manager-driver.ts:293-300`,
   `actor-id.ts:14-16`).
7. **Era A never used WebSocket hibernation**: it called `server.accept()` on a
   raw `WebSocketPair`, not `ctx.acceptWebSocket`, so a DO with a live client
   connection could not hibernate. *Source-verified* (`websocket.ts:54`).
8. **`nodejs_compat` is required for era B** at any compatibility date before
   `2026-08-04`, contradicting an earlier assumption that the published dist has
   no Node imports. *Observed*: the bundle fails with *"Could not resolve
   'module'"* / *"Could not resolve 'async_hooks'"* without the flag, and
   succeeds with it or with `compatibility_date >= 2026-08-04`.
9. **The serverless path is disabled on the 3.x line.** `rivet-dev/rivet@main`
   (`de28d208`, 2026-11-20) rejects `configurePool` with *"serverless is disabled
   in this version"* (`src/registry/config/index.ts:356-363`), while the pinned
   `rivetkit@2.3.31` still configures the pool. Combined with the absence of any
   3.x Cloudflare adapter, the Cloudflare story is currently a 2.3-branch
   capability. *Source-verified*.

---

## 2. Versions and sources inspected

### 2.1 Packages

| Package / artifact | Version | Published / commit | How inspected |
| --- | --- | --- | --- |
| `rivetkit` | `3.1.1` (`latest`) | 2026-11-11 | `npm view`, extracted tarball `dist/tsup/*.d.ts` |
| `rivetkit` | `2.3.31` | 2026-10-27 | extracted tarball (`dist/tsup/mod.d.ts`, `dist/tsup/config-*.d.ts`) |
| `rivetkit` | `2.2.1` | — | npm install into `/tmp/cfex-a`; `node_modules/rivetkit/src/**` |
| `@rivetkit/cloudflare-workers` | `2.3.31` (`latest`) | 2026-10-27 | extracted tarball, `dist/mod.mjs` read in full |
| `@rivetkit/cloudflare-workers` | `2.3.33` (`next`) | 2026-11-21 | registry metadata only |
| `@rivetkit/cloudflare-workers` | `2.3.0` | 2026-06-15 | extracted tarball; era boundary |
| `@rivetkit/cloudflare-workers` | `2.2.1` | 2026-04-02 | extracted tarball **including `src/*.ts`** (readable TypeScript ships in the tarball) |
| `@rivetkit/rivetkit-wasm` | `2.3.31` | 2026-10-27 | extracted tarball; `pkg/rivetkit_wasm_bg.wasm` = 4,639,620 bytes |
| `rivet-dev/rivet` | tag `v2.3.31` = `f6926c3103809c0119f06c85f0c38ccc4671073c` | 2026-10-27 | `git clone --depth 1 --branch v2.3.31` |
| `rivet-dev/rivet` | `main` = `de28d208dceee335af6d2f6e858792f703c1eff2` | 2026-11-20 | sparse clone (source of the current-era assertions) |
| `wrangler` | `4.47.0` and `4.166.0` | — | `--dry-run` bundling and `dev` runs |
| `typescript` | `5.9.3` | — | `tsc --noEmit` |

> Source-availability note: the `@rivetkit/cloudflare-workers` package **is not
> present in `rivet-dev/rivet@main`**. `rivetkit-typescript/packages/` contains
> only `rivetkit` and `rivetkit-wasm`. The era-B adapter therefore exists only as
> published `dist/` + sourcemaps; era A is fully readable from the `2.2.1`
> tarball's `src/`.

### 2.2 Documentation pages (all accessed 2026-11-22)

| URL | Status | Used for |
| --- | --- | --- |
| <https://rivet.dev/llms.txt> | 200 | discovered the real doc tree (all URLs below are from it) |
| <https://rivet.dev/actors/docs/wasm-vs-native-sdk/> | 200 | native vs WASM runtime; "long-lived node" statement |
| <https://rivet.dev/actors/docs/lifecycle/> | 200 | hooks, sleep/wake/destroy ordering |
| <https://rivet.dev/actors/docs/state/> | 200 | `vars` vs SQLite |
| <https://rivet.dev/actors/docs/sqlite/> | 200 | `db({onMigrate})`, savepoint semantics |
| <https://rivet.dev/actors/docs/actions/> | 200 | action concurrency/interleaving |
| <https://rivet.dev/actors/docs/keys/> | 200 | string vs array keys, injection warning |
| <https://rivet.dev/actors/docs/limits/> | 200 | soft/hard limits table |
| <https://rivet.dev/actors/docs/communicating-between-actors/> | 200 | `c.client()` |
| <https://rivet.dev/actors/docs/registry-configuration/> | 200 | `setup()` options, `sqlite.backend` |
| <https://rivet.dev/actors/docs/schedule/> | 200 | `c.schedule.after`, `c.cron.set` |
| <https://rivet.dev/actors/docs/deprecated/state/> | 200 | `c.state` deprecated in 3.0 |
| <https://rivet.dev/docs/workers/> | 200 | nodes are long-running processes |
| <https://rivet.dev/changelog/2026-06-15-introducing-rivet-2-3/> | 200 | WASM support announcement |
| <https://rivet.dev/actors/compare/rivet-actors-vs-cloudflare-durable-objects/> | 200 | vendor comparison page (marketing; treated as claims, not evidence) |
| <https://developers.cloudflare.com/durable-objects/platform/limits/> | 200 | CPU, storage, SQL limits |
| <https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/> | 200 | hibernation/eviction rules |
| <https://developers.cloudflare.com/workers/platform/limits/> | 200 | CPU, subrequests, wall time by invocation type |
| <https://developers.cloudflare.com/workers/runtime-apis/nodejs/> | 200 | `nodejs_compat` defaults |
| <https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/> | 200 | DO class `exports`/migrations, `new_sqlite_classes` |
| <https://developers.cloudflare.com/durable-objects/best-practices/websockets/> | 200 | `state.acceptWebSocket` vs `ws.accept()` |

### 2.3 Doc pages that do not exist

These were probed and returned HTTP 404. They are listed because earlier
assumptions in this investigation referenced them:

- `https://rivet.dev/docs/platforms/cloudflare` — 404
- `https://rivet.dev/docs/integrations/cloudflare-workers` — 404
- `https://rivet.dev/docs/cloudflare` — 404
- `https://rivet.dev/docs/llms.txt` — 404 (the real index is `/llms.txt`)
- `https://rivet.dev/docs/serverless` — 404
- `https://rivet.dev/docs/deploy/serverless` — 404
- `https://rivet.dev/sitemap.xml` — 404 (`/sitemap-index.xml` returns 200)

**There is no current RivetKit documentation page for deploying to Cloudflare
Workers.** `rg -il cloudflare` over `docs/` on `rivet-dev/rivet@main` returns
only `docs/actors/content/docs/sqlite-drizzle.mdx`,
`docs/actors/content/guides/a-radically-simpler-architecture.mdx` and
`docs/general/content/benchmarking.mdx`. The sole Cloudflare integration
documentation is the package README.

---

## 3. RivetKit architecture as implemented for Cloudflare

### 3.1 Actor definition shape

`actor()` is a single generic function over state, conn params, conn state, vars,
input, database, events, queues and actions (`rivetkit@2.3.31`
`dist/tsup/config-*.d.ts:484`). The verified configuration keys
(`ActorOptionsSchema`, same file `:2318-2342`) include
`createVarsTimeout`, `createConnStateTimeout`, `onMigrateTimeout`,
`onBeforeConnectTimeout`, `onConnectTimeout`, `sleepGracePeriod`,
`onDestroyTimeout`, `waitUntilTimeout`, `stateSaveInterval`, `actionTimeout`,
`connectionLivenessTimeout`, `connectionLivenessInterval`, `noSleep`,
`sleepTimeout`, `maxQueueSize`, `maxSchedules`, `maxQueueMessageSize`,
`canHibernateWebSocket`.

Runtime is selected at the **registry** level, not the actor level
(`rivetkit@2.3.31` `dist/tsup/config-*.d.ts:220-224`):

```
runtime: "auto" | "native" | "wasm";
wasm: { bindings?: typeof _rivetkit_rivetkit_wasm; initInput?: any };
```

### 3.2 Registry

The current name is **`setup`**, exported both from `rivetkit` and from
`@rivetkit/cloudflare-workers`. There is no `registry()` or `createRegistry()`
factory; `setup()` returns a `Registry` class instance
(`rivetkit/main` `src/registry/index.ts:1265-1267`).

The Cloudflare package's `setup` is a thin override (`dist/mod.mjs`):

```js
function setup(config) {
  return rivetkitSetup({
    runtime: "wasm",
    wasm: { bindings: wasmBindings, initInput: wasmModule },
    noWelcome: true,
    ...config
  });
}
```

Note the spread order: `...config` comes last, so a caller **can** override
`runtime` and silently defeat the WASM wiring. This is a real footgun and was hit
during this investigation (see §8, failure mode 1).

`Registry`'s relevant members (`rivetkit@2.3.31` `dist/tsup/config-*.d.ts:1119-1160`):
`config`, `parseConfig()`, `handler(request)`, `serve()`, `listen()`,
`startAndWait()`, `start()`, `shutdown()`, `startEnvoy()`.

### 3.3 Actor identity

- **Keys** are `string | string[]`. Array (compound) keys are the documented safe
  form for user data, because string interpolation invites delimiter injection
  (<https://rivet.dev/actors/docs/keys/>). Keys are unique per actor *name*.
- **`actorId`** is a runtime-assigned identity, distinct from the key. In era A it
  is `"<DO id hex>:<generation>"`. In era B it is engine-assigned.
- **Handles**: client-side `client.counter.getOrCreate(key)`,
  `client.counter.get(key)`, `client.counter.create(key)`; inside an actor,
  `c.client<typeof registry>()` returns the same typed surface scoped to the
  registry (`rivetkit@2.3.31` `dist/tsup/config-*.d.ts:2053`).

### 3.4 Lifecycle

Documented ordering (<https://rivet.dev/actors/docs/lifecycle/>, accessed
2026-11-22):

```
On Create:            onMigrate -> onCreate -> createVars -> onWake -> run
On Wake (sleep/crash):onMigrate -> createVars -> onWake -> run
On Sleep:             c.abortSignal -> onSleep
On Destroy:           c.abortSignal -> onDestroy
```

Key documented properties:

- `onMigrate` runs on **every** start, before anything touches the database.
- `vars` / `createVars` are **ephemeral**, rebuilt on every start, lost on sleep
  or crash.
- `c.state` is **deprecated in 3.0** and slated for removal; durable data should
  live in SQLite (`c.db`) (<https://rivet.dev/actors/docs/deprecated/state/>).
- Defaults: `sleepTimeout = 30_000 ms`, `stateSaveInterval = 1_000 ms`
  (`rivetkit` `src/actor/config.ts:1339,1345`).
- Documented sleep grace period: 15 s total budget covering `onSleep`/`onDestroy`,
  `run` shutdown, `waitUntil`, `keepAwake`, and connection cleanup
  (<https://rivet.dev/actors/docs/limits/>).

### 3.5 State and storage contract

The storage contract is **SQLite only** for durable data; there is no KV
primitive in the public 3.x API. `db({onMigrate})` returns a
`DatabaseProvider<RawAccess>` (`rivetkit@2.3.31` `dist/tsup/db/mod.d.ts:5,15`).
`onMigrate` is wrapped in a SQLite savepoint, so a throwing migration rolls back
atomically (<https://rivet.dev/actors/docs/sqlite/>).

Underneath, RivetKit's actor driver exposes a *KV-shaped* interface to the core
(`kvBatchPut`, `kvBatchGet`, `kvBatchDelete`, `kvDeleteRange`, `kvListPrefix`,
`kvListRange`) plus a `getDatabase` hook. Era A implemented the KV methods over DO
SQLite tables (`actor-driver.ts:238-300`) and returned
`ctx.storage.sql` from `getDatabase`. So even era A's "KV" was physically SQLite.

### 3.6 Actor-to-actor calls

`c.client<typeof registry>()` yields a typed client whose calls go through the
same `ManagerDriver` path as an external client. They are **not** in-process
direct invocations in either era; they are serialized request/response over the
driver. In era A that means a DO-to-DO `stub.fetch(...)`; in era B it means an
engine round trip.

Concurrency semantics are documented explicitly: *"By default, actions run in
parallel and interleave at every await. Keep each change atomic with a single SQL
statement or a transaction."*
(<https://rivet.dev/actors/docs/actions/>). This is a meaningful departure from
Durable Objects' default single-threaded run-to-completion model, and it is a
property of the runtime, not the host.

### 3.7 Feature attribution

| Feature | Implemented by | Evidence |
| --- | --- | --- |
| `actor()`, actions, hooks, vars | RivetKit TS core | `rivetkit` `dist/tsup/config-*.d.ts` |
| Action serialization + interleaving | RivetKit core runtime (WASM in era B) | docs `actions` |
| Queues, schedules, cron | RivetKit core | docs `schedule`; `@deprecated` for queues in 3.0 |
| Durable SQLite | **engine** (remote in era B; local volume in native) | `registry/config/index.ts:316-331` |
| Actor placement, wake, routing, at-least-once delivery | Rivet engine (`envoy`/control plane) | `serverless/configure.ts` |
| WebSocket upgrade | host platform (adapter shim) | era B `FetchWebSocket`; era A `upgradeWebSocket` |
| DoS/limits, CPU, memory | host platform | CF docs |

---

## 4. Actor-to-Durable-Object mapping (era A only)

This section is answered from `@rivetkit/cloudflare-workers@2.2.1`, whose tarball
ships readable `src/`. Line numbers are from that tarball.

### 4.1 One generic DO class, one DO instance per actor

`createInlineClient` builds **exactly one** DO class per Worker, once:

```ts
// src/handler.ts:66-70
const ActorHandler = createActorDurableObject(
	registry,
	() => upgradeWebSocket,
);
```

and `createActorDurableObject` returns a single anonymous class:

```ts
// src/actor-handler-do.ts:51-67
export function createActorDurableObject(
	registry: Registry<any>,
	getUpgradeWebSocket: GetUpgradeWebSocket,
): DurableObjectConstructor {
	const globalState = new CloudflareDurableObjectGlobalState();
	const parsedConfig = registry.parseConfig();
	return class ActorHandler
		extends DurableObject<Bindings>
		implements ActorHandlerInterface
	{
```

So: **one generic DO class hosts many logical actors, because it hosts exactly
one.** The actor type is not encoded in the class; it is stored in the instance's
SQLite metadata row. Many logical actors of many types share the one class, each
in a separate DO instance.

### 4.2 Key → DO ID

Deterministic, in `CloudflareActorsManagerDriver`:

```ts
// src/manager-driver.ts:335-341
const nameKeyString = serializeNameAndKey(name, key);
const doId = env.ACTOR_DO.idFromName(nameKeyString);
const actor = env.ACTOR_DO.get(doId);
const result = await actor.create({ name, key, input, allowExisting: true });
```

`serializeNameAndKey` (`src/util.ts:12-26`) escapes `:` in the name and joins the
key array on `,`, with `"(none)"` as the empty-key marker and backslash escaping
for `\` and `,` (`util.ts:34-54`). This is a hand-rolled encoding of the same
injection problem the docs warn about for string keys.

`newUniqueId()` is **never used**; `createActor` also routes through
`idFromName` (`manager-driver.ts:378-384`), so even unkeyed creates are
deterministic.

### 4.3 DO ID → actorId

```ts
// src/actor-id.ts:14-16
export function buildActorId(doId: string, generation: number): string {
	return `${doId}:${generation}`;
}
```

`generation` starts at 0 and increments when a **destroyed** actor is
resurrected (`actor-handler-do.ts:322-339`). Stale handles are rejected by
comparing the requested generation against the metadata row
(`manager-driver.ts:243-270`). This is an explicit answer to the "zombie
reference" problem DOs otherwise leave to the developer.

### 4.4 Request → dispatch → actor instance

1. Worker `fetch` strips `managerPath` (default `/api/rivet`) and forwards to the
   manager router with `RIVET` injected into `env` (`handler.ts:121-147`).
2. Manager route resolves name+key → `ACTOR_DO.get(idFromName(nameKey))`.
3. DO `fetch(request)` calls `#loadActor()` then `actorRouter.fetch(request, {actorId})`
   (`actor-handler-do.ts:406-416`).
4. `#loadActor` is memoized in a `WeakMap<DurableObjectState, ActorGlobalState>`
   (`actor-driver.ts:38-64`), instantiates the actor definition from the registry
   (`actor-driver.ts:200-213`) and passes `"unknown"` as the region with a
   `// TODO: Support regions in Cloudflare` comment (`actor-driver.ts:205-212`).

### 4.5 Storage and rehydration

The constructor creates two tables unconditionally on **every** DO
instantiation, including cold starts and post-eviction:

```ts
// src/actor-handler-do.ts:80-101
this.ctx.storage.sql.exec(`
	CREATE TABLE IF NOT EXISTS _rivetkit_kv_storage(
		key BLOB PRIMARY KEY,
		value BLOB
	);
`);
this.ctx.storage.sql.exec(`
	CREATE TABLE IF NOT EXISTS _rivetkit_metadata(
		id INTEGER PRIMARY KEY CHECK (id = 1),
		name TEXT NOT NULL,
		key TEXT NOT NULL,
		destroyed INTEGER DEFAULT 0,
		generation INTEGER DEFAULT 0
	);
`);
```

The source comment explains the choice: *"We do this instead of using the native
KV storage so we can store blob keys. The native CF KV API only supports string
keys."* (`actor-handler-do.ts:80-82`).

On eviction and reactivation the actor's in-memory state is reconstructed purely
from these tables; `_rivetkit_kv_storage` is a 2-column BLOB KV and
`kvListPrefix` is implemented with byte-range `BETWEEN` queries
(`actor-kv.ts:44-85`). There is no separate state-blob snapshot in era A — the
RivetKit KV layer is the persistence.

Destroy clears the KV table and tombstones the metadata row
(`actor-driver.ts:340-346`).

### 4.6 Required Worker export and Wrangler config

The DO class must be exported from the Worker entry and declared in the config.
Binding names are **hard-coded** in the adapter (`handler.ts:15-18`):

```ts
export interface Bindings {
	ACTOR_KV: KVNamespace;
	ACTOR_DO: DurableObjectNamespace<ActorHandlerInterface>;
}
```

`ACTOR_KV` is used only for a metadata mirror keyed
`actor:<actorId>:metadata` (`global-kv.ts:2-6`), written via `waitUntil` on create
(`actor-handler-do.ts:383-388`).

Verified working `wrangler.jsonc` for era A (see §7.3 for the build and run):

```jsonc
{
	"name": "rivet-a",
	"main": "src.ts",
	"compatibility_date": "2025-05-01",
	"compatibility_flags": ["nodejs_compat"],
	"durable_objects": {
		"bindings": [{ "name": "ACTOR_DO", "class_name": "ActorHandler" }]
	},
	"kv_namespaces": [{ "binding": "ACTOR_KV", "id": "00000000000000000000000000000000" }],
	"migrations": [{ "tag": "v1", "new_sqlite_classes": ["ActorHandler"] }]
}
```

`new_sqlite_classes` is mandatory, not cosmetic: the adapter calls
`ctx.storage.sql.exec` in the constructor, which requires the SQLite storage
backend. Cloudflare documents that classes introduced via `new_classes` get the
`legacy-kv` backend and `new_sqlite_classes` get `sqlite`
(<https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/>, accessed 2026-11-22).

### 4.7 Inline client semantics

`createInlineClient` returns `{ client, fetch, config, ActorHandler }`
(`handler.ts:29-39`). The "inline" part is only that the **client object is
constructed in-process with a `ManagerDriver`** instead of a network client:

```ts
// src/handler.ts:93-97
const client = (createClientWithDriver as any)(managerDriver) as Client<R>;
return { client, fetch: router.fetch.bind(router), config, ActorHandler };
```

It does **not** bypass the DO boundary. `CloudflareActorsManagerDriver.sendRequest`
still resolves the DO and calls `stub.fetch(actorRequest)`
(`manager-driver.ts:40-61`). So an inline-client call from the Worker costs a DO
round trip; the saving versus a public client is only the client's own HTTP/gateway
hop, not the actor hop.

### 4.8 What era A does not implement

The `ActorDriver` interface (`rivetkit@2.2.1` `dist/tsup/config-CdITuDW7.d.ts:91-145`)
declares a mix of required and optional (`?`) members. The Cloudflare driver
implements exactly these methods (`src/actor-driver.ts`, method declarations at
lines 135, 222, 229, 233, 238, 249, 263, 271, 280, 293, 306):

```
loadActor, getContext, setAlarm, getDatabase,
kvBatchPut, kvBatchGet, kvBatchDelete, kvDeleteRange,
kvListPrefix, kvListRange, startDestroy
```

It does **not** implement any of the optional members that era A needed:

| Optional `ActorDriver` member | Implemented by era A | Consequence |
| --- | --- | --- |
| `startSleep?(actorId)` | no | Cloudflare eviction decides sleep; `sleepTimeout` is inert |
| `cancelAlarm?(actorId)` | no | alarms cannot be cancelled through the driver |
| `createSqliteVfs?(actorId)` | no | `db()` throws at actor start |
| `overrideRawDatabaseClient?(actorId)` | no | no custom database client |
| `overrideDrizzleDatabaseClient?(actorId)` | no | Drizzle actors have no path either |

Verified by declaration scan of `src/actor-driver.ts`:

```
loadActor                        PRESENT
getContext                       PRESENT
setAlarm                         PRESENT
getDatabase                      PRESENT
kvBatchPut                       PRESENT
kvBatchGet                       PRESENT
kvBatchDelete                    PRESENT
kvDeleteRange                    PRESENT
kvListPrefix                     PRESENT
kvListRange                      PRESENT
startDestroy                     PRESENT
cancelAlarm                      absent
createSqliteVfs                  absent
startSleep                       absent
overrideRawDatabaseClient        absent
overrideDrizzleDatabaseClient    absent
```

Consequences, each verifiable in the code or by the runs in §7:

- **No RivetKit-driven sleep.** Eviction timing is entirely Cloudflare's
  (hibernation after ~10 s idle when eligible; full eviction after 70–140 s of
  inactivity otherwise).
- **No alarm cancellation.** `setAlarm` writes via `ctx.storage.setAlarm`, but
  destroy calls `ctx.storage.deleteAlarm()` directly instead
  (`actor-driver.ts:349`).
- **No SQLite VFS.** `db()` throws at actor start. Observed in §7.4.
- **No WebSocket hibernation.** `upgradeWebSocket` calls `server.accept?.()`
  (`websocket.ts:54`) on a raw `WebSocketPair`, which is the non-hibernatable
  path Cloudflare documents as blocking hibernation
  (<https://developers.cloudflare.com/durable-objects/best-practices/websockets/>).
- **`listActors` returns `[]`** with a warning:
  `logger().warn({msg:"listActors not fully implemented for Cloudflare Workers"})`
  (`manager-driver.ts:412-418`). Confirmed live: after successfully creating an
  actor, `GET /api/rivet/actors?name=counter` returned `{"actors":[]}`.
- **Inspector disabled** (`handler.ts:74-78`).

---

## 5. Capability matrix

Rows are capabilities. Columns are the two eras. "Native" means Rivet's own node
runtime (Node/Bun via napi), included for contrast.

| Capability | Native (`rivetkit`, napi) | Era A (`2.2.1`, DO) | Era B (`2.3.31`, WASM) |
| --- | --- | --- | --- |
| `actor({...})` definition | Yes | Yes | Yes |
| `setup()` from `rivetkit` | Yes | Yes | **No** — must import from the adapter |
| Runs without a Rivet engine | No | Yes | **No** — `RIVET_ENDPOINT` required |
| Local SQLite | Yes (`backend:"local"`) | Broken (`createSqliteVfs` missing) | Rejected by config validation |
| Remote/engine SQLite | Yes | n/a | Yes, mandatory |
| `db()` / `c.db` usable | Yes | **No** (observed throw) | Yes (via engine RPC) |
| `c.state` | Deprecated in 3.0 | Works | Works (2.3 line) |
| `c.vars` | Yes | Yes | Yes |
| Sleep controlled by RivetKit | Yes (`sleepTimeout`) | **No** — CF eviction decides | Yes (engine-driven) |
| WebSocket upgrade | Native ws | `WebSocketPair` + `server.accept()` | `fetch` + `response.webSocket` shim |
| WebSocket hibernation | n/a | **No** | n/a |
| Queues | Deprecated in 3.0 | Yes | Yes |
| `c.schedule` / `c.cron` | Yes | via DO alarms | via engine |
| Inspector | Yes | Disabled | Not exposed by adapter |
| `listActors` | Yes | **Returns `[]`** | Handled by engine |
| Regions | Yes | Hard-coded `"unknown"` | Engine-placed |
| Client in-process | n/a | Yes (`createInlineClient`) | No; `createClient` needs an endpoint |
| DO required | No | **Yes** (`ACTOR_DO` + `ACTOR_KV`) | **No** |
| Binding names configurable | n/a | **No** (hard-coded) | Only via env var names |

---

## 6. Compatibility matrix: RivetKit expectations vs Workers/DO semantics

Classifications: **native** (both agree), **adapted** (works, but the adapter or
the engine materially changes behaviour), **unsupported** (does not work),
**unknown** (not established by evidence here).

| # | Expectation | Classification | Evidence |
| --- | --- | --- | --- |
| 1 | Long-lived process holding actors | **adapted** | Era B keeps a long-lived *logical* node over HTTP: the engine is configured with `request_lifespan: 60*60` s, `metadata_poll_interval: 1000` ms, `slots_per_runner: 1`, `min_runners: 0`, `max_runners: 100000` (`rivetkit@2.3.31` `dist/tsup/mod.js:444-462`, verified in the installed pinned dist). The *process* is not long-lived; a request is. Docs for the WASM runtime still say it "runs as a long-lived node that keeps an outbound WebSocket to the control plane" (<https://rivet.dev/actors/docs/wasm-vs-native-sdk/>) — that sentence describes the native/WASM shapes generally and is **not** how the Cloudflare adapter's request-scoped path behaves. Both statements are recorded; the code is preferred. |
| 2 | In-memory state survives until sleep | **adapted** | DO hibernates after ~10 s idle when eligible, evicts after 70–140 s otherwise (`durable-object-lifecycle.md`). `sleepTimeout` (30 s default) is advisory at best in era A. |
| 3 | `onSleep` runs before sleep | **unsupported** (era A) | Driver has no `startSleep`; CF eviction does not call it. Docs already warn `onSleep` "may not always be called in situations like crashes or forced terminations" (<https://rivet.dev/actors/docs/lifecycle/>). |
| 4 | `waitUntil` | **native** | Era A uses `ctx.waitUntil` for the KV mirror and delete. CF: extends up to 30 s after response (`workers_platform_limits.md`). |
| 5 | Alarms / timers | **adapted** | `setAlarm` works; no cancel through the driver. DO alarm handlers have a 15-minute wall-time limit (`workers_platform_limits.md`). |
| 6 | CPU vs wall clock | **adapted** | DO CPU: 30 s default, configurable to 5 min. DO wall time: unlimited while the caller stays connected. Each incoming request/message resets the 30 s CPU budget (`durable-objects_platform_limits.md`). RivetKit's own `actionTimeout` default is 60 s (`actor/config.ts:1340`), which exceeds the DO CPU budget but not wall time. |
| 7 | SQLite transactions | **adapted** (era B) | Era B SQL is an RPC to the engine rather than a local call (`registry/config/index.ts:316-331` forces `backend:"remote"`). The commit-failure taxonomy of that transport is **unknown** to this report: the Rust transport source was not present in the tree inspected, and no `indeterminate` symbol appears in the published TypeScript dist of `rivetkit@2.3.31`. DO SQLite is local and synchronous — a *different* failure model, not demonstrably a stronger one. |
| 8 | Serialized execution | **native** per-DO, **adapted** per-actor | DO gives single-threaded execution per object, but RivetKit runs actions in parallel and interleaves at every `await` (<https://rivet.dev/actors/docs/actions/>). The host guarantee does not become an actor guarantee. |
| 9 | Subrequest limits | **adapted** | Workers: 50 free / 10,000 paid per request. DO: 6 simultaneous outgoing connections per request (`workers_platform_limits.md`, `durable-objects_platform_limits.md`). An actor fan-out is bounded by both. |
| 10 | WebSocket handling | **adapted** (era A), **adapted** (era B) | Era A: raw `WebSocketPair`, no hibernation. Era B: `FetchWebSocket` performs `fetch(url, {headers:{Upgrade:"websocket"}})` and requires `response.webSocket`, i.e. it depends on Workers' fetch-upgrade extension. |
| 11 | Recovery after termination | **adapted** | Era A reconstructs from DO SQLite; generation counter detects stale handles. Era B reconstructs by the engine re-`POST`ing `/start`. Exactly-once is not claimed anywhere in either source. |
| 12 | Durable execution guarantees | **unknown** | No source states at-least-once vs exactly-once for the serverless start path. `envoy.actor_overloaded` and 1,024-request queue limits are documented; delivery semantics are not. |
| 13 | `nodejs_compat` needed | **adapted** | Required for compat dates 2024-09-23…2026-08-03; implicit from 2026-08-04 (`workers_runtime-apis_nodejs.md:24-33`). Empirically required for era B (§7.2). |
| 14 | Long-running `run` loops | **unsupported** (era B) | A Worker invocation is request-scoped; there is no process to host an unbounded loop. `keepAwake` holds an actor awake, not a process. |
| 15 | Memory | **adapted** | 128 MB per isolate including the WASM linear memory; the WASM module alone is 4.64 MB (`rivetkit_wasm_bg.wasm` size observed). |

---

## 7. Complete working example (era B, current API)

Everything below was executed. Paths and outputs are verbatim.

### 7.1 Files

`package.json`:

```json
{
  "name": "rivetkit-cf-example",
  "private": true,
  "type": "module",
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": {
    "@rivetkit/cloudflare-workers": "2.3.31",
    "rivetkit": "2.3.31"
  },
  "devDependencies": {
    "typescript": "5.9.3",
    "wrangler": "4.166.0",
    "@cloudflare/workers-types": "5.20261121.1"
  }
}
```

Note on the `@cloudflare/workers-types` version: `wrangler@4.166.0` declares an
optional peer `@cloudflare/workers-types@^5.20261119.1`. Pinning the older
`4.20251118.0` makes a plain `npm install` fail with `ERESOLVE` ("Conflicting peer
dependency"). The version above is the one npm resolved successfully in a clean
`/tmp/verify` directory. The example does not actually need the package — it
declares its own `interface Env` — but leaving it out of `devDependencies` while
`wrangler` lists it as an optional peer is also fine.

`src/index.ts`:

```ts
import { actor } from "rivetkit";
import { createClient } from "rivetkit/client";
import { createHandler, setup } from "@rivetkit/cloudflare-workers";

// --- 1. Actors -------------------------------------------------------------

const ledger = actor({
	state: { hits: 0 as number },
	actions: {
		record: (c, n: number) => {
			c.state.hits += n;
			return c.state.hits;
		},
		getHits: (c) => c.state.hits,
	},
});

const counter = actor({
	state: { count: 0 as number },
	actions: {
		increment: (c, amount: number) => {
			c.state.count += amount;
			return c.state.count;
		},
		getCount: (c) => c.state.count,
		// Actor-to-actor call via the server-side client.
		incrementAndRecord: async (c, amount: number) => {
			c.state.count += amount;
			const client = c.client<typeof registry>();
			const ledgerHits = await client.ledger.getOrCreate(["main"]).record(amount);
			return { count: c.state.count, ledgerHits };
		},
	},
});

// --- 2. Registry (must come from @rivetkit/cloudflare-workers) --------------

const registry = setup({ use: { counter, ledger } });

// --- 3. Worker entry -------------------------------------------------------

interface Env {
	RIVET_ENDPOINT: string;
}

const handler = createHandler(registry, {
	fetch: async (request: Request, env: Env) => {
		const url = new URL(request.url);
		const name = url.searchParams.get("name") ?? "demo";

		const client = createClient<typeof registry>({ endpoint: env.RIVET_ENDPOINT });

		if (url.pathname === "/count") {
			const count = await client.counter.getOrCreate([name]).getCount();
			return Response.json({ name, count });
		}

		if (url.pathname === "/increment") {
			const result = await client.counter.getOrCreate([name]).incrementAndRecord(1);
			return Response.json({ name, ...result });
		}

		return new Response("Not found", { status: 404 });
	},
});

export default handler;
```

`wrangler.jsonc`:

```jsonc
{
	"$schema": "node_modules/wrangler/config-schema.json",
	"name": "rivetkit-cf-example",
	"main": "src/index.ts",
	"compatibility_date": "2026-11-01",
	"observability": { "enabled": true },
	"vars": {
		"RIVET_ENDPOINT": "https://production:REPLACE_ME@api.rivet.dev"
	}
}
```

No `durable_objects`, no `migrations`, no `kv_namespaces`. That absence *is* the
finding.

### 7.2 Verified commands and output

Re-run end to end in a clean directory (`/tmp/verify`, containing only the three
files above):

```sh
$ npm install
added 148 packages in 8s
# exit 0

$ ./node_modules/.bin/tsc --noEmit --module esnext --moduleResolution bundler \
      --target es2022 --strict --skipLibCheck src/index.ts
# exit 0, no diagnostics

$ ./node_modules/.bin/wrangler deploy --dry-run --outdir /tmp/verify-out
 ⛅️ wrangler 4.166.0
────────────────────
Total Upload: 6348.15 KiB / gzip: 1783.25 KiB
Your Worker has access to the following bindings:
Binding                                                              Resource
env.RIVET_ENDPOINT ("https://production:REPLACE_ME@api.riv...")      Environment Variable

--dry-run: exiting now.
# exit 0
```

Emitted bundle contains the WASM binary as a separate module:

```
-rw-r--r--  4639620  3a855cd982199979924ba5de58e9bafb89f09edb-rivetkit_wasm_bg.wasm
-rw-r--r--  1860887  index.js
```

`npx wrangler dev --local` (port 8811), with a placeholder endpoint:

```sh
$ curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8811/api/rivet/metadata
200
$ curl -s http://127.0.0.1:8811/api/rivet/metadata
{"actorNames":{"counter":{"metadata":{}},"ledger":{"metadata":{}}},
 "envoy":{"kind":{"serverless":{}},"version":1},
 "envoyProtocolVersion":8,"runtime":"rivetkit","version":"2.3.31"}
```

This proves the WASM core runtime instantiates and serves the manager API inside
`workerd`. It does **not** prove actions execute, because action execution needs a
real engine. With the placeholder endpoint the action route fails as expected:

```sh
$ curl -s "http://127.0.0.1:8811/count?name=x"
RivetError: The namespace does not exist.
```

and the engine start endpoint rejects an unauthenticated call:

```sh
$ curl -s -X POST -H 'content-type: application/json' -d '{}' \
       http://127.0.0.1:8811/api/rivet/start
{"group":"request","code":"invalid",
 "message":"Invalid request: x-rivet-pool-name header is required", ...}
```

### 7.3 Era A historical example (do not present as current)

```ts
import { actor, setup } from "rivetkit";
import { createHandler } from "@rivetkit/cloudflare-workers";

const counter = actor({
	state: { count: 0 },
	actions: { inc: (c) => ++c.state.count, get: (c) => c.state.count },
});

const registry = setup({ use: { counter } });

const { handler, ActorHandler } = createHandler(registry, {
	fetch: async (req: Request, env: any) => {
		const url = new URL(req.url);
		const h = env.RIVET.counter.getOrCreate(["demo"]);
		if (url.pathname === "/inc") return Response.json({ n: await h.inc() });
		if (url.pathname === "/get") return Response.json({ n: await h.get() });
		return new Response("ok");
	},
});

export { ActorHandler };
export default handler;
```

With the era-A `wrangler.jsonc` from §4.6, against
`@rivetkit/cloudflare-workers@2.2.1`:

```sh
$ npx tsc --noEmit ... src.ts        # exit 0
$ npx wrangler@4.166.0 deploy --dry-run --outdir /tmp/eraA-out
Total Upload: 2207.14 KiB / gzip: 400.03 KiB
env.ACTOR_DO (ActorHandler)                          Durable Object
env.ACTOR_KV (00000000000000000000000000000000)      KV Namespace
# exit 0
```

`wrangler dev` round trip, proving actor state persists **inside the DO** across
requests:

```sh
$ curl -s http://127.0.0.1:8805/inc   -> {"n":1}
$ curl -s http://127.0.0.1:8805/inc   -> {"n":2}
$ curl -s http://127.0.0.1:8805/get   -> {"n":2}
```

Creating an actor through the manager API returns the DO-derived id:

```sh
$ curl -s -X POST -H 'content-type: application/json' \
    -d '{"name":"counter","key":"demo","runner_name_selector":"default","crash_policy":"restart"}' \
    http://127.0.0.1:8803/api/rivet/actors
{"actor":{"actor_id":"aa97b88ed038418be5590a10f0be1cf599e697dbd0278f7d0acbeace5db181a3:0", ...}}
```

and `listActors` is empty immediately afterwards, as the source says it must be:

```sh
$ curl -s 'http://127.0.0.1:8803/api/rivet/actors?name=counter'
{"actors":[]}
# worker log: level=WARN msg="listActors not fully implemented for Cloudflare Workers"
```

### 7.4 Era A + `db()` — failure, verbatim

Same adapter and config, actor using `db({onMigrate})`:

```
level=ERROR msg="database setup failed" actor=sq key=demo
  error="Error: SqliteVfs instance not provided in context. The driver must provide a sqliteVfs instance."
```

Stack, verbatim:

```
at createClient (node_modules/rivetkit/src/db/mod.ts:52:11)
at null.<anonymous> (node_modules/rivetkit/src/actor/instance/mod.ts:1881:16)
at #measureStartup (node_modules/rivetkit/src/actor/instance/mod.ts:431:25)
at #setupDatabase (node_modules/rivetkit/src/actor/instance/mod.ts:1880:24)
at start (node_modules/rivetkit/src/actor/instance/mod.ts:567:14)
at loadActor (node_modules/@rivetkit/cloudflare-workers/src/actor-driver.ts:206:23)
at #loadActor (node_modules/@rivetkit/cloudflare-workers/src/actor-handler-do.ts:217:22)
at create (node_modules/@rivetkit/cloudflare-workers/src/actor-handler-do.ts:392:15)
```

This is a **documented-behaviour-vs-source conflict**: the vendored
`examples/cloudflare-workers` README and actor file on the 2.2 line use `db()`
and describe "Native Durable Object SQLite", but the adapter never supplies
`ctx.sqliteVfs`. Both are recorded; the runtime result above is authoritative.

### 7.5 Dev/deploy commands

```sh
npx wrangler dev            # local workerd, no Cloudflare account needed
npx wrangler dev --remote   # against real DO/KV bindings (era A only)
npx wrangler deploy         # era B needs only RIVET_ENDPOINT as a secret/var
```

Era B requires a reachable engine for any real work; `RIVET_ENDPOINT` carries
namespace and token inline (`https://namespace:token@host`), per the package
README.

---

## 8. Limitations and failure modes

1. **Wrong `setup` import silently produces an unusable Worker.** Importing
   `setup` from `rivetkit` instead of `@rivetkit/cloudflare-workers` yields a
   registry whose `runtime` is `"auto"`; in `workerd` the runtime loader then
   fails with
   `RivetKit could not load a core runtime. Native runtime: Error: No such module
   "@rivetkit/rivetkit-napi". Wasm runtime: Error: No such module
   "@rivetkit/rivetkit-wasm".` *Observed.* The type system does not catch this;
   both imports are structurally compatible. Cause: the spread order in the
   adapter's `setup` (§3.2) and the fact that `runtime:"wasm"` is only set by the
   adapter's wrapper.
2. **Era B cannot run without a Rivet engine.** There is no self-contained
   deployment. The engine must reach `<managerPath>/start` and
   `<managerPath>/metadata`, and the Worker must reach the engine.
   *Source-verified* + observed 400 on unauthenticated `/start`. Worse for
   longevity: on `rivet-dev/rivet@main` (`de28d208`, 2026-11-20) the config
   validator rejects the serverless pool outright —
   `ctx.addIssue({message: "serverless is disabled in this version",
   path: ["configurePool"]})` (`src/registry/config/index.ts:356-363`). The
   Cloudflare path is therefore a 2.3-line capability with no 3.x replacement in
   evidence.
3. **Era B has no local SQLite.** Config validation hard-fails
   (`WebAssembly runtime cannot use local SQLite`), so every query is a network
   RPC to the engine instead of a local call.
   *Source-verified* (`registry/config/index.ts:316-331`). The retry/commit
   semantics of that RPC were not established; see §11.
4. **Era B's adapter is missing from the public repo.** Only built output
   exists, so there is no upstream source to diff or patch against; `main` no
   longer contains the package.
5. **Era A `listActors` is a stub.** Dashboards and admin flows that enumerate
   actors see an empty list. *Observed.*
6. **Era A cannot hibernate DOs with live sockets** (`ws.accept()`, not
   `ctx.acceptWebSocket`), so an idle chat/game actor keeps billing duration.
7. **Era A's `db()` is non-functional**, so the only ergonomic durable storage in
   era A is the deprecated `c.state`.
8. **Hard-coded bindings in era A.** `ACTOR_KV` and `ACTOR_DO` cannot be renamed
   without patching the adapter (`handler.ts:15-18`).
9. **Version lock.** Era B pins `rivetkit` exactly (`2.3.31`), so `rivetkit@3.x`
   is unreachable from Cloudflare, including the 3.0 deprecation of `c.state`.
10. **`nodejs_compat` requirement is date-sensitive.** Without it (and before
    compat date `2026-08-04`) the bundle fails to resolve `module` and
    `async_hooks`. *Observed.*
11. **Bundle size.** 6.3 MB uncompressed / 1.78 MB gzip for era B, against a
    64 MiB Worker limit; 4.64 MB is the WASM module alone. Not a blocker, but the
    cost is paid on every cold start.
12. **`@rivetkit/cloudflare-workers` has no 3.x release at all**, and its `next`
    tag (`2.3.33`) is newer than `latest` (`2.3.31`), so "latest" is not the
    newest build.

---

## 9. Portability assessment

### 9.1 Can the same `actor({...})` run unmodified on both?

**Yes for the actor body; no for the module around it.** Verified by
construction: the same `counter`/`ledger` definitions in §7.1 typecheck against
`rivetkit@2.3.31` and bundle for Workers. The definition is pure data handed to a
runtime.

Platform leaks, in the order a porter would hit them:

| Leak | Native | Cloudflare | Severity |
| --- | --- | --- | --- |
| `setup` import | `rivetkit` | `@rivetkit/cloudflare-workers` | **High** — silent runtime failure, not caught by types |
| Registry start | `registry.start()` (long-lived node) | must **not** be called; `createHandler` only | High |
| Client construction | `createClient<typeof registry>(url)` | same, but endpoint must be the engine | Medium |
| Storage backend | `sqlite: {backend:"local"}` allowed | `local` rejected outright | **High** |
| SQL dialect | SQLite | SQLite (remote) — same dialect, different latency/failure model | Low–Medium |
| `c.vars` timers | `setInterval` fine | no process-scoped loop | Medium |
| WebSockets | native `ws` | fetch-upgrade + `response.webSocket` shim | Medium |
| Secrets/env | `process.env` | `env` bindings, unavailable before first request | Low |
| Error types | `RivetError` | same classes | Low |

`c.db` is API-identical but semantically different: local page-cache reads versus
a network round trip to the engine. Code that assumes a synchronous-ish local
database will be correct but slower; whether naive retry can double-apply is
**unknown**, because the engine-side commit-failure taxonomy was not verifiable
from the sources inspected (see §11).

### 9.2 Is the storage implementation interchangeable?

At the **interface** level, yes: both eras implement the same `ActorDriver`
`kvBatch*`/`kvList*` contract, and era B routes through the engine's envoy
transport. At the **implementation** level, no: era A's KV is a two-column BLOB
table in DO SQLite; era B's is the engine's own storage. Neither is a drop-in for
the other, and neither exposes the same atomicity envelope as the other. The
`2.2.0` tree's own audit flags the Cloudflare path specifically: batch KV
operations are "per-key loops without explicit transaction grouping"
(`.agent/notes/actor-kv-issues-and-sqlite-resolution.md`, finding 8), so a
multi-key write is not atomic inside a DO.

### 9.3 Are lifecycle semantics equivalent?

No.

| Aspect | Era A (DO) | Era B (engine) |
| --- | --- | --- |
| Sleep trigger | Cloudflare eviction (10 s hibernation-eligible / 70–140 s otherwise) | engine, honouring `sleepTimeout` |
| `onSleep` | not driven by RivetKit | driven by engine |
| Destroy | `startDestroy` + generation bump + DO tombstone | engine-managed |
| State versioning | `generation` in `actorId` | engine-side; not exposed to the adapter |
| Region | `"unknown"` (TODO in source) | engine-placed |

Actor destruction *semantics* differ too: era A destroys by tombstoning the same
DO row and clearing KV, so the DO instance (and its storage) is reused forever;
there is no way to reclaim the DO. A 1,000-actor churn test would leave 1,000
permanent DOs.

### 9.4 What abstraction would hide the seams

Stated as the seam, not as a design:

1. **A runtime-provider seam** at registry construction: one function
   `createRuntime(env) -> {registry, handler, clientFactory}` that hides
   `setup`-vs-`setup`, `start()`-vs-not, and endpoint acquisition.
2. **A storage seam** declaring whether SQL is local-synchronous or
   remote-RPC, so callers can choose retry/idempotency policy rather than
   discovering it at runtime.
3. **A lifecycle seam** exposing *whether the host drives sleep*, so `onSleep`
   cleanup is not silently skipped.
4. **A client seam** that yields a typed client from inside and outside the
   process without the caller knowing which.

The evidence supports (1) and (4) strongly — those are pure construction
differences with identical downstream types. It supports (3) weakly, because era
A has no host sleep hook at all, so a seam can only *report* the absence. It does
**not** support (2) as a thin adapter: the local/remote SQLite distinction changes
the failure model, not just the call site.

---

## 10. Architectural assessment

What the evidence establishes:

- **RivetKit's actor model is runtime-parametric by construction.** `runtime` is
  a registry-level enum, `ActorDriver` is the pluggable surface, and the same
  `actor()` value is accepted by every runtime. Portability is a first-class
  design goal, and the WASM runtime exists specifically to reach hosts like
  Workers.
- **Two very different Cloudflare integrations were built, and the DO one was
  abandoned.** That is the strongest single signal in this investigation: the
  team with the deepest knowledge of RivetKit's driver interface chose, in
  `2.3.0`, to stop mapping actors to Durable Objects and instead run the core
  runtime inside the Worker with the engine as the authority. The pre-`2.3` code
  explains why that choice is defensible — the DO driver was a partial
  implementation (no `createSqliteVfs`, no `startSleep`, no alarm cancel, no
  hibernation, stub `listActors`), and every gap was structural, not a missing
  method body.
- **The one thing DOs would have given for free — local durable SQLite per actor
  — is exactly what era A failed to wire up**, and what era B had to move off-box.
  That is the load-bearing asymmetry: Durable Objects' storage model matches
  RivetKit's "database per actor" requirement better than the engine's remote
  SQLite does, yet Rivet chose remote SQLite plus an engine round trip.
- **The current Cloudflare story is "run RivetKit's runtime on Workers, keep the
  engine".** It is a hosting adaptor, not an independence story. A Cloudflare
  deployment of era B has the same operational dependency on a Rivet engine as
  any other RivetKit deployment; Cloudflare contributes compute and edge
  placement only.
- **The trend line is away from Workers, not toward it.** `main` disables the
  serverless pool ("serverless is disabled in this version"), and no 3.x
  Cloudflare adapter has been published. An organisation choosing this path in
  November 2026 is choosing a 2.3-branch capability whose forward path is
  `[INFERENCE]` unclear. This is the strongest reason to treat the integration as
  an experiment rather than a platform commitment.

What the evidence does **not** establish:

- Whether era B's per-request WASM instantiation is cheap enough for a
  request-per-action workload. No cold-start measurement was taken; the
  `slots_per_runner: 1` and 1-hour lifespan settings suggest the engine expects
  reuse, but this was not measured.
- Whether the `2.2.x` DO adapter could be completed into a correct
  implementation. The missing pieces are identifiable. Note that
  `@rivetkit/cloudflare-workers@2.2.1` itself depends only on `invariant`, `zod`,
  `hono` and `rivetkit@2.2.1` — it does **not** depend on `@rivetkit/sqlite-vfs`;
  that package is a dependency of `rivetkit@2.2.1` itself. So the VFS plumbing
  was never assembled by the adapter, and wiring it would require a SQLite VFS
  layered over DO SQLite. That design is documented for the `2.2` line, in-tree:
  `docs-internal/rivetkit-typescript/SQLITE_VFS.md` at tag `v2.2.0` describes
  chunked-KV SQLite (4 KiB chunks as KV keys, DELETE journal, no WAL,
  single-writer). The same tree's `.agent/notes/actor-kv-issues-and-sqlite-resolution.md`
  (2026-02-24) audits the likely failure modes, including that the Cloudflare
  driver runs batch KV operations as per-key loops without transaction grouping.
- Whether an actor definition that uses `db()` at all can be considered portable
  today: it typechecks everywhere and runs on native + era B, and throws on era A.
- Any guarantee about action delivery semantics on the serverless start path.

Contrast for completeness, flagged as vendor claim rather than evidence: Rivet's
own comparison page asserts *"Same model on both, so each Durable Object class maps
to one Rivet Actor"* and lists DO limits (128 MB isolate, 10 GB SQLite per object,
no self-hosting) as reasons to prefer Rivet
(<https://rivet.dev/actors/compare/rivet-actors-vs-cloudflare-durable-objects/>,
accessed 2026-11-22). The 128 MB and 10 GB figures **do** match Cloudflare's own
limits pages; the "one DO class maps to one Rivet Actor" framing does **not**
match era A's implementation, which maps one *DO instance* to one actor through a
single shared class.

---

## 11. Open questions / unknown unknowns

1. **Was era A ever production-viable?** The `2.2.1` tarball's `db()` is broken
   under `wrangler dev`, yet the pinned `rivetkit` version resolved
   `db`-requiring actors to a hard throw. Whether some configuration (e.g. a
   `sqlite-vfs` package wired by the user) makes it work was not established.
2. **Why is the era-B adapter absent from `rivet-dev/rivet@main`?** The package
   still publishes weekly. Is it maintained out-of-tree, in another branch, or
   generated?
3. **Will there be a `3.x` Cloudflare adapter, and is serverless coming back?**
   None exists on npm; `rivetkit@3.1.1` deprecates `c.state`, which is era A's
   only working durable storage; and `main` explicitly disables the serverless
   pool that era B depends on (`registry/config/index.ts:356-363`, commit
   `de28d208`). Whether that disablement is temporary or a product decision was
   not established. If it is permanent, era B has no forward path.
4. **What are the actual delivery semantics of `/api/rivet/start`?** At-least-once
   is implied by the 1,024-request queue limit and `envoy.actor_overloaded`, but
   no source states it. Related: the engine-side SQLite transport's commit-failure
   taxonomy (whether a lost commit acknowledgement is distinguishable) was not
   verifiable — the Rust transport was outside the tree inspected, and no such
   symbol appears in `rivetkit@2.3.31`'s published TypeScript dist.
5. **How does era B behave when an invocation is killed mid-action?** The engine
   has `drainGracePeriod` and `drainOnVersionUpgrade`, but Worker-side abort
   handling was not exercised.
6. **Does the `FetchWebSocket` shim survive DO-style hibernation or CF's
   fetch-upgrade restrictions?** It was read, not load-tested against a live
   engine.
7. **Is `2.3.33` (the `next` tag) materially different from `2.3.31`?** Only the
   registry metadata was inspected; the dist was not diffed.
8. **Cold-start cost of the 4.64 MB WASM module per invocation** — unmeasured.
9. **The `examples/cloudflare-workers` README's "Native Durable Object SQLite"
   claim** is contradicted by both the `2.2.1` adapter source and the observed
   runtime error. Which is the intended contract was not established.
10. **`c.client()` hop count on Cloudflare.** It is a `ManagerDriver` call, so at
    least one DO round trip in era A and at least one engine round trip in era B;
    the actual count under `getOrCreate` was not traced.
