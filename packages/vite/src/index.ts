import type { Plugin } from "vite";

/**
 * Badag's Vite plugin.
 *
 * Valid and hook-free for now; build-time integration lands here.
 */
export function badag(): Plugin {
    return { name: "badag" };
}
