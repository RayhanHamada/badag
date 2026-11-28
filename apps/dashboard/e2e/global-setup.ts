import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";
import type { ViteDevServer } from "vite";
import type { TestProject } from "vitest/node";

const host = "127.0.0.1";
const port = 3100;
const root = fileURLToPath(new URL("..", import.meta.url));
const engineRoot = fileURLToPath(new URL("../../engine", import.meta.url));
const engineHealthUrl = "http://127.0.0.1:8787/api/v1/health";
const ENGINE_READY_ATTEMPTS = 360;

async function waitForEngine(attempt = 0): Promise<void> {
    if (attempt >= ENGINE_READY_ATTEMPTS) {
        throw new Error(`Timed out waiting for ${engineHealthUrl}.`);
    }

    const response = await fetch(engineHealthUrl).catch(() => null);

    if (response?.ok) {
        return;
    }

    await delay(250);
    await waitForEngine(attempt + 1);
}

function stopEngine(pid: number | undefined) {
    if (pid === undefined) {
        return;
    }

    try {
        process.kill(-pid, "SIGTERM");
    } catch {
        // Already exited.
    }
}

export default async function setup(project: TestProject) {
    // The dashboard proxies /api/v1 to the engine worker, so the browser suite
    // needs both servers running.
    const engine = spawn("bun", ["run", "dev"], {
        cwd: engineRoot,
        detached: true,
        env: { ...process.env, NO_COLOR: "1" },
        stdio: "inherit",
    });

    try {
        await waitForEngine();

        const server: ViteDevServer = await createServer({
            root,
            logLevel: "error",
            server: { host, port, strictPort: true },
        });

        await server.listen();
        project.provide("baseUrl", `http://${host}:${port}`);

        return async () => {
            await server.close();
            stopEngine(engine.pid);
        };
    } catch (error) {
        stopEngine(engine.pid);
        throw error;
    }
}
