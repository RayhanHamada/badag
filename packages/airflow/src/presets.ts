/**
 * The six Airflow node presets.
 *
 * A preset is configuration over a role: compute, router, or waiter. The type
 * name is what the spec stores; the role tells the runtime how to treat it.
 * Nothing here executes.
 */

import { defineNode } from "@badag/dag";
import type {
    AnySchema,
    MaybePromise,
    NodeContext,
    NodeDefinition,
    NodePayloadOf,
    NodeProducedOf,
} from "@badag/dag";
import type { JsonObject, JsonValue } from "@badag/graph";

import { assertAirflowKey, assertRouteLabel } from "./keys";
import type { TriggerRule } from "./trigger-rule";

/** What a node contributes at execution. */
export type NodeRole = "compute" | "router" | "waiter";

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
export type TaskConfig = PresetConfig<"compute">;

/** Config produced by a `branch` preset. */
export type BranchConfig = PresetConfig<
    "router",
    { readonly branches?: readonly string[] }
>;

/** Config produced by a `sensor` preset. */
export type SensorConfig = PresetConfig<
    "waiter",
    { readonly pokeIntervalMs?: number }
>;

/** Config produced by a `delay` preset. */
export type DelayConfig = PresetConfig<
    "waiter",
    { readonly durationMs: number }
>;

/** Config produced by a `shortCircuit` preset. */
export type ShortCircuitConfig = PresetConfig<
    "router",
    { readonly branches: readonly ["run", "skip"] }
>;

/** Config produced by a `trigger` preset. */
export type TriggerConfig = PresetConfig<
    "compute",
    { readonly dagId: string; readonly waitForCompletion: boolean }
>;

/** Options every preset accepts. */
export interface NodeOptions<
    Input extends AnySchema = AnySchema,
    Output extends AnySchema = AnySchema,
> {
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
     * Schema for the value delivered in `ctx.payload`.
     */
    readonly input?: Input;
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
    Payload = undefined,
> = (ctx: NodeContext<Key, Payload>) => MaybePromise<BranchChoice<Name>>;

/** A branch preset's options. */
export interface BranchOptions<
    Key extends string = string,
    Branches extends readonly string[] = readonly string[],
    Input extends AnySchema = undefined,
> extends NodeOptions<Input, undefined> {
    /**
     * Route labels this branch may select; inferred as a literal tuple.
     */
    readonly branches?: Branches;
    /**
     * Chooses the branch or branches to activate.
     */
    readonly choose: BranchChooser<Key, Branches[number], NodePayloadOf<Input>>;
}

/**
 * Build a branch preset: a router that selects route labels.
 */
export function branch<
    const Key extends string,
    const Branches extends readonly string[] = readonly string[],
    Input extends AnySchema = undefined,
>(
    key: Key,
    options: BranchOptions<Key, Branches, Input>
): NodeDefinition<Key, "branch", Input, undefined, BranchConfig> {
    assertAirflowKey("Node key", key);

    for (const name of options.branches ?? []) {
        assertRouteLabel(name);
    }

    return defineNode({
        key,
        type: "branch",
        config: nodeConfig(
            "router",
            options,
            options.branches === undefined
                ? undefined
                : { branches: [...options.branches] }
        ),
        input: options.input,
        run: options.choose,
    });
}

/** A sensor predicate. */
export type SensorPredicate<
    Key extends string = string,
    Payload = undefined,
> = (ctx: NodeContext<Key, Payload>) => MaybePromise<boolean>;

/** A sensor preset's options. */
export interface SensorOptions<
    Key extends string = string,
    Input extends AnySchema = undefined,
> extends NodeOptions<Input, undefined> {
    /**
     * Predicate the sensor evaluates.
     */
    readonly predicate: SensorPredicate<Key, NodePayloadOf<Input>>;
    /**
     * Polling interval in milliseconds; must be finite and greater than 0.
     */
    readonly pokeIntervalMs?: number;
}

/**
 * Build a sensor preset: a waiter that polls a predicate.
 */
export function sensor<
    const Key extends string,
    Input extends AnySchema = undefined,
>(
    key: Key,
    options: SensorOptions<Key, Input>
): NodeDefinition<Key, "sensor", Input, undefined, SensorConfig> {
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
            "waiter",
            options,
            pokeIntervalMs === undefined ? undefined : { pokeIntervalMs }
        ),
        input: options.input,
        run: options.predicate,
    });
}

/** A delay preset's options. */
export interface DelayOptions extends NodeOptions<undefined, undefined> {
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
): NodeDefinition<Key, "delay", undefined, undefined, DelayConfig> {
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
        config: nodeConfig("waiter", options, {
            durationMs: options.durationMs,
        }),
    });
}

/** A short-circuit condition. */
export type ShortCircuitCondition<
    Key extends string = string,
    Payload = undefined,
> = (ctx: NodeContext<Key, Payload>) => MaybePromise<boolean>;

/** A short-circuit preset's options. */
export interface ShortCircuitOptions<
    Key extends string = string,
    Input extends AnySchema = undefined,
> extends NodeOptions<Input, undefined> {
    /**
     * Condition that selects `run` or `skip`.
     */
    readonly condition: ShortCircuitCondition<Key, NodePayloadOf<Input>>;
}

/**
 * Build a short-circuit preset: a router with two fixed labels.
 */
export function shortCircuit<
    const Key extends string,
    Input extends AnySchema = undefined,
>(
    key: Key,
    options: ShortCircuitOptions<Key, Input>
): NodeDefinition<Key, "short_circuit", Input, undefined, ShortCircuitConfig> {
    assertAirflowKey("Node key", key);

    return defineNode({
        key,
        type: "short_circuit",
        config: nodeConfig("router", options, {
            branches: ["run", "skip"] as const,
        }),
        input: options.input,
        run: (ctx) => (options.condition(ctx) ? "run" : "skip"),
    });
}

/** A trigger preset's options. */
export interface TriggerOptions<
    Key extends string = string,
    Input extends AnySchema = undefined,
> extends NodeOptions<Input, undefined> {
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
    readonly run?: (
        ctx: NodeContext<Key, NodePayloadOf<Input>>
    ) => MaybePromise<unknown>;
}

/**
 * Build a trigger preset: a compute node that starts another DAG.
 */
export function trigger<
    const Key extends string,
    Input extends AnySchema = undefined,
>(
    key: Key,
    options: TriggerOptions<Key, Input>
): NodeDefinition<Key, "trigger", Input, undefined, TriggerConfig> {
    assertAirflowKey("Node key", key);
    assertAirflowKey("Trigger DAG id", options.dagId);

    return defineNode({
        key,
        type: "trigger",
        config: nodeConfig("compute", options, {
            dagId: options.dagId,
            waitForCompletion: options.waitForCompletion ?? false,
        }),
        input: options.input,
        run: options.run,
    });
}

/** A regular task preset's options. */
export interface TaskOptions<
    Key extends string = string,
    Input extends AnySchema = undefined,
    Output extends AnySchema = undefined,
> extends NodeOptions<Input, Output> {
    /**
     * The work the task performs.
     */
    readonly run: (
        ctx: NodeContext<Key, NodePayloadOf<Input>>
    ) => MaybePromise<NodeProducedOf<Output>>;
}

/**
 * Build a regular task preset: a compute node.
 */
export function task<
    const Key extends string,
    Input extends AnySchema = undefined,
    Output extends AnySchema = undefined,
>(
    key: Key,
    options: TaskOptions<Key, Input, Output>
): NodeDefinition<Key, "task", Input, Output, TaskConfig> {
    assertAirflowKey("Node key", key);

    return defineNode({
        key,
        type: "task",
        config: nodeConfig("compute", options),
        input: options.input,
        output: options.output,
        run: options.run,
    });
}
