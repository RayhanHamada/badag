import { defineHandler, HTTPError } from "nitro";
import { proxyRequest } from "nitro/h3";
import { useRuntimeConfig } from "nitro/runtime-config";

// The public API lives in the engine worker. Proxy it so the browser keeps a
// same-origin `/api/v1` and the dashboard server owns deployment concerns such
// as cookies and origin policy.
export default defineHandler((event) => {
    const engineUrl = String(useRuntimeConfig().engineUrl ?? "");

    if (engineUrl === "") {
        throw new HTTPError(
            "The engine API URL is not configured. Set NITRO_ENGINE_URL.",
            { status: 503 }
        );
    }

    const { pathname, search } = new URL(event.req.url);

    return proxyRequest(
        event,
        `${engineUrl.replace(/\/+$/u, "")}${pathname}${search}`
    );
});
