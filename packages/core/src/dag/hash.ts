/**
 * Content hashes for node declarations and the DAGs that register them.
 *
 * Hashing is asynchronous because it uses Web Crypto's SHA-256, the one digest
 * every Badag runtime exposes (Node, Bun, browsers, Workers). A definition
 * exposes `hash()` instead of a stored value, so authoring stays synchronous
 * and no digest starts until someone asks for it.
 */

import { canonicalStringify } from "../graph";
import type { JsonObject, JsonValue } from "../graph";

const encoder = new TextEncoder();

/** SHA-256 over a string, rendered as 64 lowercase hex digits. */
async function sha256Hex(input: string): Promise<string> {
    const digest = await globalThis.crypto.subtle.digest(
        "SHA-256",
        encoder.encode(input)
    );

    return Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0")
    ).join("");
}

/**
 * Config without the keys that describe the node rather than determine it.
 *
 * `description` is the only metadata key the spec reserves; it never changes
 * what a node does, so it never changes the hash.
 */
function hashableConfig(config: JsonObject): JsonObject {
    const hashable: Record<string, JsonValue> = {};

    for (const [key, value] of Object.entries(config)) {
        if (key !== "description") {
            hashable[key] = value;
        }
    }

    return hashable;
}

/**
 * Hash a node's type, config, and behavior source.
 *
 * The source is the registered callback's source text, or an override when a
 * preset registers a generated wrapper around the behavior that matters.
 * `undefined` means the node has no code, which hashes differently from an
 * empty callback. The node key and description are deliberately excluded.
 */
export async function nodeHashOf(
    type: string,
    config: JsonObject,
    source?: string
): Promise<string> {
    return sha256Hex(
        canonicalStringify({
            type,
            config: hashableConfig(config),
            source: source ?? null,
        })
    );
}

/**
 * Hash a DAG from the hashes of every task registered in it.
 *
 * Hashes are sorted, so registration order never changes the result. The DAG
 * key and its edges are not part of this hash: names and topology are the
 * spec's `revision`; this hash answers whether the tasks themselves changed.
 */
export async function dagHashOf(hashes: readonly string[]): Promise<string> {
    return sha256Hex(canonicalStringify(hashes.toSorted()));
}
