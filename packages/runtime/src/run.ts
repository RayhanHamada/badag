/**
 * The in-memory executor.
 *
 * It resolves a spec in topological order, carrying route labels forward until
 * each node's activation policy consumes them. It does not retry, persist, or
 * validate payloads: those belong to the durable runtime.
 */

import type { AnyImplementation } from "@badag/dag";
import { checkSpec, orderSpec } from "@badag/graph";
import type { GraphNode, GraphSpec, JsonObject } from "@badag/graph";

import { activates, isActivationPolicy } from "./policy";
import type { ActivationPolicy } from "./policy";
import type {
    NodeRun,
    OutcomeStatus,
    RunEvent,
    RunInput,
    RunResult,
} from "./types";

interface InEdge {
    readonly from: string;
    readonly label?: string;
}

interface Prepared {
    readonly nodes: ReadonlyMap<string, GraphNode>;
    readonly incoming: ReadonlyMap<string, readonly InEdge[]>;
    readonly outLabels: ReadonlyMap<string, ReadonlySet<string>>;
    readonly order: readonly string[];
}

interface State {
    readonly prepared: Prepared;
    readonly implementations: RunInput["implementations"];
    readonly outcomes: Map<string, NodeRun>;
    readonly events: RunEvent[];
    readonly activeLabels: Set<string>;
    readonly targets: Set<string>;
}

type Decision =
    | { readonly type: "pending" }
    | { readonly type: "skip"; readonly reason: string }
    | { readonly type: "fail"; readonly error: string }
    | { readonly type: "run"; readonly role: string };

const NO_EDGES: readonly InEdge[] = [];

// Router results and thrown values cross the registry boundary untyped; these
// helpers establish the domain value before it is used.
// oxlint-disable anti-slop/no-runtime-typeof
// oxlint-disable anti-slop/no-unknown-parameters
function show(value: unknown): string {
    try {
        return JSON.stringify(value) ?? String(value);
    } catch {
        return String(value);
    }
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function selectionOf(key: string, value: unknown): readonly string[] {
    if (typeof value === "string") {
        return [value];
    }

    if (!Array.isArray(value)) {
        throw new TypeError(
            `Router "${key}" returned ${show(value)}; expected a string or an array of strings`
        );
    }

    const selection: string[] = [];

    for (const entry of value) {
        if (typeof entry !== "string") {
            throw new TypeError(
                `Router "${key}" returned ${show(value)}; every entry must be a string`
            );
        }

        selection.push(entry);
    }

    return selection;
}
// oxlint-enable anti-slop/no-runtime-typeof
// oxlint-enable anti-slop/no-unknown-parameters

function prepare(spec: GraphSpec): Prepared {
    const nodes = new Map(spec.nodes.map((node) => [node.key, node] as const));
    const incoming = new Map<string, InEdge[]>();
    const outLabels = new Map<string, Set<string>>();

    for (const edge of spec.edges) {
        const inEdges = incoming.get(edge.to) ?? [];

        inEdges.push(
            edge.label === undefined
                ? { from: edge.from }
                : { from: edge.from, label: edge.label }
        );
        incoming.set(edge.to, inEdges);

        if (edge.label !== undefined) {
            const labels = outLabels.get(edge.from) ?? new Set<string>();

            labels.add(edge.label);
            outLabels.set(edge.from, labels);
        }
    }

    return { nodes, incoming, outLabels, order: orderSpec(spec) };
}

function policyOf(config: JsonObject): ActivationPolicy | undefined {
    const stored = config.triggerRule;

    if (stored === undefined) {
        return "all_success";
    }

    return isActivationPolicy(stored) ? stored : undefined;
}

function roleOf(config: JsonObject): string {
    const { role } = config;

    if (role === undefined) {
        return "compute";
    }

    if (role === "compute" || role === "router" || role === "waiter") {
        return role;
    }

    throw new Error(
        `Unknown node role ${show(role)}; expected compute, router, or waiter`
    );
}

function resolve(state: State, outcome: NodeRun): void {
    state.outcomes.set(outcome.key, outcome);

    if (outcome.status === "skipped") {
        state.events.push({
            type: "skipped",
            key: outcome.key,
            attempt: outcome.attempt,
            reason: outcome.reason ?? "skipped",
        });

        return;
    }

    if (outcome.status === "failed") {
        state.events.push({
            type: "failed",
            key: outcome.key,
            attempt: outcome.attempt,
            error: outcome.error ?? "failed",
        });
    }
}

function decide(state: State, key: string): Decision {
    const node = state.prepared.nodes.get(key);

    if (node === undefined) {
        return {
            type: "fail",
            error: `Node "${key}" is not declared in the spec`,
        };
    }

    const inEdges = state.prepared.incoming.get(key) ?? NO_EDGES;
    const targeted = state.targets.has(key);

    const enabled = targeted
        ? inEdges
        : inEdges.filter(
              (edge) =>
                  edge.label === undefined || state.activeLabels.has(edge.label)
          );

    if (inEdges.length > 0 && enabled.length === 0) {
        return { type: "skip", reason: "no active route" };
    }

    for (const edge of enabled) {
        if (!state.outcomes.has(edge.from)) {
            return { type: "pending" };
        }
    }

    if (inEdges.length > 0) {
        const upstream: OutcomeStatus[] = [];

        for (const edge of enabled) {
            const outcome = state.outcomes.get(edge.from);

            if (outcome === undefined) {
                return {
                    type: "fail",
                    error: `Node "${edge.from}" is unresolved`,
                };
            }

            upstream.push(outcome.status);
        }

        const policy = policyOf(node.config);

        if (policy === undefined) {
            return {
                type: "fail",
                error: `Unknown trigger rule ${show(node.config.triggerRule)}`,
            };
        }

        if (!activates(policy, upstream)) {
            return { type: "skip", reason: `activation policy ${policy}` };
        }
    }

    try {
        return { type: "run", role: roleOf(node.config) };
    } catch (error) {
        return { type: "fail", error: messageOf(error) };
    }
}

function applySelection(
    state: State,
    key: string,
    selection: readonly string[]
): void {
    const labels = state.prepared.outLabels.get(key);

    for (const selected of selection) {
        if (labels?.has(selected) === true) {
            state.activeLabels.add(selected);

            continue;
        }

        if (state.prepared.nodes.has(selected)) {
            state.targets.add(selected);

            continue;
        }

        throw new Error(
            `Router "${key}" selected "${selected}", which is neither an outgoing label nor a node key`
        );
    }
}

async function execute(state: State, key: string, role: string): Promise<void> {
    state.events.push({ type: "started", key, attempt: 1 });

    const implementation: AnyImplementation | undefined =
        state.implementations.get(key);

    if (implementation === undefined) {
        resolve(state, {
            key,
            status: "failed",
            attempt: 1,
            error: `Node "${key}" has no implementation`,
        });

        return;
    }

    try {
        const value = await implementation.run({ key, payload: undefined });

        if (role === "router") {
            applySelection(state, key, selectionOf(key, value));
        }

        state.outcomes.set(key, {
            key,
            status: "succeeded",
            attempt: 1,
            value,
        });
        state.events.push({ type: "succeeded", key, attempt: 1 });
    } catch (error) {
        const message = messageOf(error);

        state.outcomes.set(key, {
            key,
            status: "failed",
            attempt: 1,
            error: message,
        });
        state.events.push({ type: "failed", key, attempt: 1, error: message });
    }
}

/**
 * Execute a spec in memory.
 *
 * Throws when the spec is structurally invalid (unknown endpoint, self edge,
 * duplicate node, cycle). A node-level problem — a missing implementation, an
 * unknown role or policy, a bad router result — fails that node instead.
 */
export async function run(input: RunInput): Promise<RunResult> {
    const findings = checkSpec(input.spec);

    if (findings.length > 0) {
        const [first] = findings;

        throw new Error(
            `Graph "${input.spec.key}" is invalid: ${first?.message ?? "unknown finding"}`
        );
    }

    const prepared = prepare(input.spec);

    const state: State = {
        prepared,
        implementations: input.implementations,
        outcomes: new Map(),
        events: [],
        activeLabels: new Set(),
        targets: new Set(),
    };

    while (state.outcomes.size < prepared.order.length) {
        let progressed = false;

        for (const key of prepared.order) {
            if (state.outcomes.has(key)) {
                continue;
            }

            const decision = decide(state, key);

            if (decision.type === "pending") {
                continue;
            }

            if (decision.type === "skip") {
                resolve(state, {
                    key,
                    status: "skipped",
                    attempt: 1,
                    reason: decision.reason,
                });
            } else if (decision.type === "fail") {
                resolve(state, {
                    key,
                    status: "failed",
                    attempt: 1,
                    error: decision.error,
                });
            } else {
                // Execution is sequential by design: a deterministic event log
                // is worth more than concurrency in the in-memory executor.
                // oxlint-disable-next-line eslint/no-await-in-loop
                await execute(state, key, decision.role);
            }

            progressed = true;
        }

        if (!progressed) {
            throw new Error(
                `Graph "${input.spec.key}" stalled with ${prepared.order.length - state.outcomes.size} unresolved node(s)`
            );
        }
    }

    return { outcomes: state.outcomes, events: state.events };
}
