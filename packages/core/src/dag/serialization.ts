/**
 * Serialized DAG and task snapshots returned by `DAG.toJSON()`.
 */

import { definedFields } from "../fields";
import type { TaskConfig } from "../task/base";
import { TASK_KIND_ENUM } from "../task/kind";
import type { TaskKind } from "../task/kind";
import type { TriggerRule } from "../task/trigger-rule";
import type { DAGTask } from "./registered-task";

/**
 * Fields common to every serialized task kind.
 */
export interface TaskJsonBase<Kind extends TaskKind> {
    /**
     * Unique id within the owning DAG.
     */
    readonly id: string;
    /**
     * Discriminates the task kind.
     */
    readonly kind: Kind;
    /**
     * Trigger rule stored on the task.
     */
    readonly triggerRule: TriggerRule;
    /**
     * Optional human-readable description.
     */
    readonly description?: string;
    /**
     * Optional per-task settings; omitted when the task has none.
     */
    readonly config?: TaskConfig;
    /**
     * Names of tasks that must finish before this task.
     */
    readonly upstream: readonly string[];
    /**
     * Names of tasks that run after this task.
     */
    readonly downstream: readonly string[];
}

/** A serialized regular task. */
export type TaskJsonTask = TaskJsonBase<typeof TASK_KIND_ENUM.Task>;

/** A serialized sensor task; the predicate itself is omitted. */
export interface SensorTaskJson extends TaskJsonBase<
    typeof TASK_KIND_ENUM.Sensor
> {
    /**
     * Delay between predicate evaluations in milliseconds.
     */
    readonly pokeIntervalMs?: number;
}

/** A serialized delay task. */
export interface DelayTaskJson extends TaskJsonBase<
    typeof TASK_KIND_ENUM.Delay
> {
    /**
     * Delay duration in milliseconds.
     */
    readonly durationMs: number;
}

/** A serialized branch task; the chooser itself is omitted. */
export type BranchTaskJson = TaskJsonBase<typeof TASK_KIND_ENUM.Branch>;

/** A serialized short-circuit task; the condition itself is omitted. */
export type ShortCircuitTaskJson = TaskJsonBase<
    typeof TASK_KIND_ENUM.ShortCircuit
>;

/** A serialized trigger task. */
export interface TriggerTaskJson extends TaskJsonBase<
    typeof TASK_KIND_ENUM.Trigger
> {
    /**
     * ID of the DAG to trigger.
     */
    readonly dagId: string;
    /**
     * Whether the trigger waits for the target DAG to finish.
     */
    readonly waitForCompletion: boolean;
}

/**
 * A task as it appears in `DAG.toJSON()`; functions are not serialized.
 */
export type TaskJson =
    | TaskJsonTask
    | SensorTaskJson
    | DelayTaskJson
    | BranchTaskJson
    | ShortCircuitTaskJson
    | TriggerTaskJson;

/**
 * JSON-safe snapshot of a DAG; edge lists contain task ids.
 */
export interface DAGJson {
    /**
     * Airflow-style id of the DAG.
     */
    readonly dagId: string;
    /**
     * Optional human-readable description of the DAG.
     */
    readonly description?: string;
    /**
     * Registered tasks in registration order.
     */
    readonly tasks: readonly TaskJson[];
}

/** Common serialized fields, omitting absent optional metadata. */
function taskJsonBase(task: DAGTask): Omit<TaskJsonBase<TaskKind>, "kind"> {
    return definedFields({
        id: task.id,
        triggerRule: task.triggerRule,
        description: task.description,
        config: task.config,
        upstream: [...task.upstream].map((upstream) => upstream.id),
        downstream: [...task.downstream].map((downstream) => downstream.id),
    });
}

/**
 * Snapshot one task, omitting functions and absent optional fields.
 *
 * Also backs `DAGTask.toJSON()`, so a task handle and the same task inside
 * `DAG.toJSON()` always have the same shape.
 */
export function serializeTask(task: DAGTask): TaskJson {
    const base = taskJsonBase(task);
    const { definition } = task;

    switch (definition.kind) {
        case TASK_KIND_ENUM.Sensor: {
            return definedFields({
                ...base,
                kind: TASK_KIND_ENUM.Sensor,
                pokeIntervalMs: definition.pokeIntervalMs,
            });
        }

        case TASK_KIND_ENUM.Delay: {
            return {
                ...base,
                kind: TASK_KIND_ENUM.Delay,
                durationMs: definition.durationMs,
            };
        }

        case TASK_KIND_ENUM.Branch: {
            return { ...base, kind: TASK_KIND_ENUM.Branch };
        }

        case TASK_KIND_ENUM.ShortCircuit: {
            return { ...base, kind: TASK_KIND_ENUM.ShortCircuit };
        }

        case TASK_KIND_ENUM.Trigger: {
            return {
                ...base,
                kind: TASK_KIND_ENUM.Trigger,
                dagId: definition.dagId,
                waitForCompletion: definition.waitForCompletion,
            };
        }

        default: {
            return { ...base, kind: TASK_KIND_ENUM.Task };
        }
    }
}

/**
 * Return a JSON-safe snapshot of a DAG.
 *
 * The snapshot keeps the DAG id and description; tasks keep their ids, kinds,
 * descriptions, trigger rules, configs, and serializable kind-specific fields;
 * edges are listed by task id. Functions are omitted. `JSON.stringify(dag)`
 * calls this through `DAG.toJSON()`, so `config` values must be
 * JSON-serializable for that conversion.
 */
export function serializeDAG(
    dagId: string,
    description: string | undefined,
    tasks: readonly DAGTask[]
): DAGJson {
    return definedFields({
        dagId,
        description,
        tasks: tasks.map((task) => serializeTask(task)),
    });
}
