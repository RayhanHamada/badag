/**
 * The graph spec: the pure-data, versioned description of a graph.
 *
 * Nothing here knows about tasks, execution, or an authoring syntax. A node is
 * a key, an open type, and open JSON config; an edge is a directed,
 * optionally labeled relationship between two node keys.
 */

/** The version of the spec shape written by this package. */
export const SPEC_VERSION = 1 as const;

/** A JSON value a node config may contain. */
export type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonObject
    | readonly JsonValue[];

/** A JSON object a node config may contain. */
export interface JsonObject {
    readonly [key: string]: JsonValue;
}

/** A node as it appears in a spec. */
export interface GraphNode {
    /**
     * The declared identifier, unique within the graph.
     */
    readonly key: string;
    /**
     * Open discriminator; interpreted by the layer that owns the type.
     */
    readonly type: string;
    /**
     * Open JSON config; the graph layer never interprets it.
     */
    readonly config: JsonObject;
}

/** A node as accepted by the builder; config defaults to an empty object. */
export interface GraphNodeInput {
    readonly key: string;
    readonly type: string;
    readonly config?: JsonObject;
}

/** A directed, optionally labeled edge. */
export interface GraphEdge {
    readonly from: string;
    readonly to: string;
    /**
     * Route label. The graph layer stores it and never interprets it.
     *
     * A labeled and an unlabeled edge between the same pair may coexist, and a
     * pair may carry several distinct labels.
     */
    readonly label?: string;
}

/** A graph spec as a reader sees it, including its content revision. */
export interface GraphSpec {
    readonly specVersion: typeof SPEC_VERSION;
    /**
     * The graph's declared key.
     */
    readonly key: string;
    /**
     * Content hash of the canonical spec: nodes sorted by key, edges sorted by
     * `(from, to, label)`. Two specs with the same revision are the same
     * definition regardless of declaration order.
     */
    readonly revision: string;
    /**
     * Nodes in insertion order.
     */
    readonly nodes: readonly GraphNode[];
    /**
     * Edges in insertion order.
     */
    readonly edges: readonly GraphEdge[];
}

// Config crosses the API typed as JsonValue, but JavaScript callers can pass
// non-JSON values. These checks are the boundary that keeps a spec JSON-real:
// every object and array is copied and frozen, and non-finite numbers,
// functions, and undefined are rejected.
// oxlint-disable anti-slop/no-runtime-typeof
// oxlint-disable eslint/no-use-before-define -- freezeValue and freezeRecord are mutually recursive.
function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
    return Array.isArray(value);
}

function freezeValue(value: JsonValue): JsonValue {
    if (value === null) {
        return null;
    }

    if (isJsonArray(value)) {
        return Object.freeze(value.map((entry) => freezeValue(entry)));
    }

    if (typeof value === "object") {
        return freezeRecord(value);
    }

    if (typeof value === "number" && !Number.isFinite(value)) {
        throw new TypeError("Config numbers must be finite");
    }

    if (
        typeof value !== "string" &&
        typeof value !== "boolean" &&
        typeof value !== "number"
    ) {
        throw new TypeError(
            `Config values must be JSON; received ${typeof value}`
        );
    }

    return value;
}
// oxlint-enable anti-slop/no-runtime-typeof

function freezeRecord(record: JsonObject): JsonObject {
    const copy: Record<string, JsonValue> = {};

    for (const [key, value] of Object.entries(record)) {
        copy[key] = freezeValue(value);
    }

    return Object.freeze(copy);
}

/**
 * Copy a config to any depth and freeze every object and array in the copy.
 *
 * A caller keeps no shared reference into an stored spec, and a non-JSON value
 * is rejected here instead of silently canonicalizing to `null`.
 */
export function freezeConfig(config?: JsonObject): JsonObject {
    return freezeRecord(config ?? {});
}
