# @badag/vite

The Vite plugin for Badag. It is a valid, hook-free plugin today: the factory returns a named plugin so it can be registered in a Vite config while build-time integration is still empty.

```ts
import { badag } from "@badag/vite";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [badag()],
});
```

## Install

```sh
bun add -d @badag/vite
```

`vite` is a peer dependency (`^8.0.0`). ESM-only, ships declaration files.

## Build

`@badag/vite` is a Bun workspace package bundled with `tsdown`. `bun run build` emits `dist/`; `bun run typecheck` checks the source.
