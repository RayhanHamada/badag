/**
 * Canonical serialization and the content revision.
 *
 * The revision must not depend on declaration order or object key order:
 * moving an independent node or rewriting a config object with the same
 * entries describes the same graph, so it must hash the same.
 */

import type { GraphEdge, GraphNode, JsonObject, JsonValue } from "./spec";
import { SPEC_VERSION } from "./spec";

/** FNV-1a 64-bit offset basis. */
// Hex is the algorithm's own notation; a bigint literal cannot be grouped to
// satisfy both rules here.
// oxlint-disable-next-line unicorn/prefer-bigint-literals
const FNV_OFFSET_BASIS = BigInt("0xcbf29ce484222325");

/** FNV-1a 64-bit prime. */
// oxlint-disable-next-line unicorn/prefer-bigint-literals
const FNV_PRIME = BigInt("0x100000001b3");

/** 64-bit mask. */
// oxlint-disable-next-line unicorn/prefer-bigint-literals
const UINT64_MASK = BigInt("0xffffffffffffffff");

const encoder = new TextEncoder();

/**
 * Serialize a JSON value with object keys sorted at every level.
 *
 * Arrays keep their order: index is meaningful, key order is not.
 */
export function canonicalStringify(value: JsonValue): string {
    if (value === null) {
        return "null";
    }

    if (Array.isArray(value)) {
        return `[${value.map((item) => canonicalStringify(item)).join(",")}]`;
    }

    // JSON has no runtime tag, so the primitive test is the only discriminator
    // left after null and arrays.
    // oxlint-disable-next-line anti-slop/no-runtime-typeof
    if (typeof value !== "object") {
        return JSON.stringify(value) ?? "null";
    }

    // SAFETY: JsonValue minus null, arrays, and primitives is JsonObject.
    const object = value as JsonObject;

    const fields = Object.keys(object)
        .toSorted()
        .map(
            (key) => `${JSON.stringify(key)}:${canonicalStringify(object[key])}`
        );

    return `{${fields.join(",")}}`;
}

/** Hash a string with FNV-1a 64-bit, rendered as 16 lowercase hex digits. */
export function fnv1a64(input: string): string {
    let hash = FNV_OFFSET_BASIS;

    for (const byte of encoder.encode(input)) {
        // FNV-1a is defined by XOR and modular masking.
        // oxlint-disable-next-line eslint/no-bitwise
        hash ^= BigInt(byte);
        // oxlint-disable-next-line eslint/no-bitwise
        hash = (hash * FNV_PRIME) & UINT64_MASK;
    }

    return hash.toString(16).padStart(16, "0");
}

function compareKeys(left: string, right: string): number {
    if (left < right) {
        return -1;
    }

    return left > right ? 1 : 0;
}

function compareEdges(left: GraphEdge, right: GraphEdge): number {
    return (
        compareKeys(left.from, right.from) ||
        compareKeys(left.to, right.to) ||
        compareKeys(left.label ?? "", right.label ?? "")
    );
}

/**
 * Compute the revision of a graph.
 *
 * Nodes are sorted by key and edges by `(from, to, label)` before hashing, so
 * declaration order never changes the result.
 */
export function revisionOf(
    key: string,
    nodes: readonly GraphNode[],
    edges: readonly GraphEdge[]
): string {
    // Absent and null labels describe the same edge, so the canonical form
    // spells the absence explicitly and keeps one object shape.
    const canonicalEdges: JsonValue[] = edges
        .toSorted(compareEdges)
        .map((edge) => ({
            from: edge.from,
            to: edge.to,
            label: edge.label ?? null,
        }));

    const canonicalNodes = nodes
        .toSorted((left, right) => compareKeys(left.key, right.key))
        .map((node) => ({
            key: node.key,
            type: node.type,
            config: node.config,
        }));

    const canonical: JsonValue = {
        specVersion: SPEC_VERSION,
        key,
        nodes: canonicalNodes,
        edges: canonicalEdges,
    };

    return fnv1a64(canonicalStringify(canonical));
}
