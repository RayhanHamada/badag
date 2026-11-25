/**
 * The six Airflow node presets.
 *
 * A preset is configuration over a role: compute, router, or waiter. The type
 * name is what the spec stores; the role tells the runtime how to treat it.
 * Nothing here executes.
 */

import { defineNode } from "@badag/core";
import type {
    AnySchema,
    JsonObject,
    JsonValue,
    MaybePromise,
    NodeContext,
    NodeDefinition,
    NodeProducedOf,
} from "@badag/core";

import { assertAirflowKey, assertRouteLabel } from "./keys";
import type { TriggerRule } from "./trigger-rule";

const NODE_ROLE_ENUM = {
    COMPUTE: "compute",
    ROUTER: "router",
    WAITER: "waiter",
} as const;

export type ComputeNodeRole = typeof NODE_ROLE_ENUM.COMPUTE;

export type RouterNodeRole = typeof NODE_ROLE_ENUM.ROUTER;

export type WaiterNodeRole = typeof NODE_ROLE_ENUM.WAITER;

/** What a node contributes at execution. */
export type NodeRole = ComputeNodeRole | RouterNodeRole | WaiterNodeRole;

export const SHORT_CIRCUIT_BRANCH_ENUM = {
    RUN: "run",
    SKIP: "skip",
} as const;

export type ShortCircuitBranches = readonly [
    typeof SHORT_CIRCUIT_BRANCH_ENUM.RUN,
    typeof SHORT_CIRCUIT_BRANCH_ENUM.SKIP,
];

/** Config keys every preset writes, plus its preset-specific keys. */
export type PresetConfig<
    Role extends NodeRole,
    Extra extends JsonObject = Record<never, never>,
> = {
    readonly role: Role;
    readonly description?: string;
    readonly triggerRule?: TriggerRule;
    readonly retries?: number;
} & Extra;

/** Config produced by a `task` preset. */
export type TaskConfig = PresetConfig<ComputeNodeRole>;

/** Config produced by a `branch` preset. */
export type BranchConfig = PresetConfig<
    RouterNodeRole,
    { readonly branches?: readonly string[] }
>;

/** Config produced by a `sensor` preset. */
export type SensorConfig = PresetConfig<
    WaiterNodeRole,
    { readonly pokeIntervalMs?: number }
>;

/** Config produced by a `delay` preset. */
export type DelayConfig = PresetConfig<
    WaiterNodeRole,
    { readonly durationMs: number }
>;

/** Config produced by a `shortCircuit` preset. */
export type ShortCircuitConfig = PresetConfig<
    RouterNodeRole,
    {
        readonly branches: ShortCircuitBranches;
    }
>;

/** Config produced by a `trigger` preset. */
export type TriggerConfig = PresetConfig<
    ComputeNodeRole,
    { readonly dagId: string; readonly waitForCompletion: boolean }
>;

/** Options every preset accepts. */
export interface NodeOptions<Output extends AnySchema = AnySchema> {
    /**
     * Human-readable label, stored in config.
     */
    readonly description?: string;
    /**
     * Additional JSON config, stored as-is. Keys outside the preset's config
     * type are not reflected in `node.config`.
     */
    readonly config?: JsonObject;
    /**
     * Activation policy; the runtime defaults to `all_success`.
     */
    readonly triggerRule?: TriggerRule;
    /**
     * Schema for the value the node produces.
     */
    readonly output?: Output;
}

interface ConfigSource {
    readonly description?: string;
    readonly config?: JsonObject;
    readonly triggerRule?: TriggerRule;
}

function nodeConfig<
    const Role extends NodeRole,
    const Extra extends JsonObject = Record<never, never>,
>(role: Role, options: ConfigSource, extra?: Extra): PresetConfig<Role, Extra> {
    const config = new Map<string, JsonValue>(
        Object.entries({ ...options.config, ...extra, role })
    );

    if (options.description !== undefined) {
        config.set("description", options.description);
    }

    if (options.triggerRule !== undefined) {
        config.set("triggerRule", options.triggerRule);
    }

    // SAFETY: every entry comes from the JSON config or a JSON-valued preset
    // field; the cast restores the fixed keys and the caller's extra shape.
    return Object.fromEntries(config) as PresetConfig<Role, Extra>;
}

/** A branch name, or a set of branch names. */
export type BranchChoice<Name extends string> = Name | readonly Name[];

/** Chooses the route labels a branch activates. */
export type BranchChooser<
    Key extends string = string,
    Name extends string = string,
> = (ctx: NodeContext<Key>) => MaybePromise<BranchChoice<Name>>;

/** A branch preset's options. */
export interface BranchOptions<
    Key extends string = string,
    Branches extends readonly string[] = readonly string[],
> extends NodeOptions<undefined> {
    /**
     * Route labels this branch may select; inferred as a literal tuple.
     */
    readonly branches?: Branches;
    /**
     * Chooses the branch or branches to activate.
     */
    readonly choose: BranchChooser<Key, Branches[number]>;
}

/**
 * Build a branch preset: a router that selects route labels.
 */
export function branch<
    const Key extends string,
    const Branches extends readonly string[] = readonly string[],
>(
    key: Key,
    options: BranchOptions<Key, Branches>
): NodeDefinition<Key, "branch", undefined, BranchConfig> {
    assertAirflowKey("Node key", key);

    for (const name of options.branches ?? []) {
        assertRouteLabel(name);
    }

    return defineNode({
        key,
        type: "branch",
        config: nodeConfig(
            NODE_ROLE_ENUM.ROUTER,
            options,
            options.branches === undefined
                ? undefined
                : { branches: [...options.branches] }
        ),
        run: options.choose,
    });
}

/** A sensor predicate. */
export type SensorPredicate<Key extends string = string> = (
    ctx: NodeContext<Key>
) => MaybePromise<boolean>;

/** A sensor preset's options. */
export interface SensorOptions<
    Key extends string = string,
> extends NodeOptions<undefined> {
    /**
     * Predicate the sensor evaluates.
     */
    readonly predicate: SensorPredicate<Key>;
    /**
     * Polling interval in milliseconds; must be finite and greater than 0.
     */
    readonly pokeIntervalMs?: number;
}

/**
 * Build a sensor preset: a waiter that polls a predicate.
 */
export function sensor<const Key extends string>(
    key: Key,
    options: SensorOptions<Key>
): NodeDefinition<Key, "sensor", undefined, SensorConfig> {
    assertAirflowKey("Node key", key);

    const { pokeIntervalMs } = options;

    if (pokeIntervalMs !== undefined) {
        if (!Number.isFinite(pokeIntervalMs)) {
            throw new TypeError("pokeIntervalMs must be a finite number");
        }

        if (pokeIntervalMs <= 0) {
            throw new Error("pokeIntervalMs must be greater than 0");
        }
    }

    return defineNode({
        key,
        type: "sensor",
        config: nodeConfig(
            NODE_ROLE_ENUM.WAITER,
            options,
            pokeIntervalMs === undefined ? undefined : { pokeIntervalMs }
        ),
        run: options.predicate,
    });
}

/** A delay preset's options. */
export interface DelayOptions extends NodeOptions<undefined> {
    /**
     * Delay duration in milliseconds; must be finite and non-negative.
     */
    readonly durationMs: number;
}

/**
 * Build a delay preset: a waiter that waits for a fixed duration.
 *
 * No implementation is declared; the runtime owns the wait.
 */
export function delay<const Key extends string>(
    key: Key,
    options: DelayOptions
): NodeDefinition<Key, "delay", undefined, DelayConfig> {
    assertAirflowKey("Node key", key);

    if (!Number.isFinite(options.durationMs)) {
        throw new TypeError("durationMs must be a finite number");
    }

    if (options.durationMs < 0) {
        throw new Error("durationMs must be greater than or equal to 0");
    }

    return defineNode({
        key,
        type: "delay",
        config: nodeConfig(NODE_ROLE_ENUM.WAITER, options, {
            durationMs: options.durationMs,
        }),
    });
}

/** A short-circuit condition. */
export type ShortCircuitCondition<Key extends string = string> = (
    ctx: NodeContext<Key>
) => MaybePromise<boolean>;

/** A short-circuit preset's options. */
export interface ShortCircuitOptions<
    Key extends string = string,
> extends NodeOptions<undefined> {
    /**
     * Condition that selects `run` or `skip`.
     */
    readonly condition: ShortCircuitCondition<Key>;
}

/**
 * Build a short-circuit preset: a router with two fixed labels.
 */
export function shortCircuit<const Key extends string>(
    key: Key,
    options: ShortCircuitOptions<Key>
): NodeDefinition<Key, "short_circuit", undefined, ShortCircuitConfig> {
    assertAirflowKey("Node key", key);

    return defineNode({
        key,
        type: "short_circuit",
        config: nodeConfig(NODE_ROLE_ENUM.ROUTER, options, {
            branches: [
                SHORT_CIRCUIT_BRANCH_ENUM.RUN,
                SHORT_CIRCUIT_BRANCH_ENUM.SKIP,
            ] as const,
        }),
        // The registered callback is a wrapper with constant source; the
        // condition is the behavior that determines the node.
        hashSource: options.condition.toString(),
        run: (ctx) =>
            options.condition(ctx)
                ? SHORT_CIRCUIT_BRANCH_ENUM.RUN
                : SHORT_CIRCUIT_BRANCH_ENUM.SKIP,
    });
}

/** A trigger preset's options. */
export interface TriggerOptions<
    Key extends string = string,
> extends NodeOptions<undefined> {
    /**
     * DAG id to start; must follow the Airflow key convention.
     */
    readonly dagId: string;
    /**
     * Whether to wait for the target DAG to finish; defaults to false.
     */
    readonly waitForCompletion?: boolean;
    /**
     * Optional launch behavior; the runtime may supply it instead.
     */
    readonly run?: (ctx: NodeContext<Key>) => MaybePromise<unknown>;
}

/**
 * Build a trigger preset: a compute node that starts another DAG.
 */
export function trigger<const Key extends string>(
    key: Key,
    options: TriggerOptions<Key>
): NodeDefinition<Key, "trigger", undefined, TriggerConfig> {
    assertAirflowKey("Node key", key);
    assertAirflowKey("Trigger DAG id", options.dagId);

    return defineNode({
        key,
        type: "trigger",
        config: nodeConfig(NODE_ROLE_ENUM.COMPUTE, options, {
            dagId: options.dagId,
            waitForCompletion: options.waitForCompletion ?? false,
        }),
        run: options.run,
    });
}

/** A regular task preset's options. */
export interface TaskOptions<
    Key extends string = string,
    Output extends AnySchema = undefined,
> extends NodeOptions<Output> {
    /**
     * The work the task performs.
     */
    readonly run: (
        ctx: NodeContext<Key>
    ) => MaybePromise<NodeProducedOf<Output>>;
}

/**
 * Build a regular task preset: a compute node.
 */
export function task<
    const Key extends string,
    Output extends AnySchema = undefined,
>(
    key: Key,
    options: TaskOptions<Key, Output>
): NodeDefinition<Key, "task", Output, TaskConfig> {
    assertAirflowKey("Node key", key);

    return defineNode({
        key,
        type: "task",
        config: nodeConfig(NODE_ROLE_ENUM.COMPUTE, options),
        output: options.output,
        run: options.run,
    });
}
