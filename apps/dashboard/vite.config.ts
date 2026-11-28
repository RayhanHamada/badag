import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { redact as viteRedact } from "@tanstack/redact/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const config = defineConfig({
    resolve: { tsconfigPaths: true },
    build: {
        // `@tanstack/start-plugin-core` builds with `builder.sharedPlugins`, so
        // Vite's `vite:css-post` plugin is created once from this top-level
        // config and reads `build.sourcemap` here, not the per-environment
        // value. Only the SSR environment enables sourcemaps (set by Nitro), so
        // on a `false` root value css-post drops the map for CSS `?url` chunks
        // and Rolldown logs SOURCEMAP_BROKEN.
        // https://github.com/vitejs/vite/issues/23809 — drop once fixed upstream.
        sourcemap: true,
    },
    environments: {
        // Only the server needs sourcemaps (stack traces); static assets don't.
        client: { build: { sourcemap: false } },
        // Nitro builds this entry as the `ssr` service and fetches it for
        // requests no Nitro route matched.
        ssr: { build: { rolldownOptions: { input: "./src/server.ts" } } },
    },
    plugins: [
        devtools(),
        tanstackStart(),
        tailwindcss(),
        viteReact(),
        viteRedact(),
        nitro({
            serverDir: "./server",
            runtimeConfig: {
                // Base URL of the Cloudflare engine worker. Override in production
                // with NITRO_ENGINE_URL.
                engineUrl: "",
            },
            $development: {
                runtimeConfig: { engineUrl: "http://127.0.0.1:8787" },
            },
        }),
    ],
});

export default config;
