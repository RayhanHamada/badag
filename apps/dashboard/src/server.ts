import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

// Nitro owns the HTTP server: it serves static assets, proxies `/api/v1` to
// the engine worker, and delegates everything unmatched to this TanStack Start
// SSR and server-function entry.
export default createServerEntry({
    fetch(request, opts) {
        return handler.fetch(request, opts);
    },
});
