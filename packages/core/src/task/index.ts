/**
 * Public surface of the task module.
 *
 * Exports the factories, the kind enum, and the definition types. Internal
 * helpers (`taskMetadata`, `taskSchemas`, `normalizeTaskId`,
 * `sameTaskBehavior`) stay module-private so importing this barrel never
 * widens the package's API.
 */

export { branch } from "./branch";

export { delay } from "./delay";

export { sensor } from "./sensor";

export { shortCircuit } from "./short-circuit";

export { task } from "./task";

export { trigger } from "./trigger";

export { TASK_KIND_ENUM } from "./kind";

export type { TaskKind } from "./kind";

export type {
    AnySchema,
    AnyTaskFn,
    MaybePromise,
    SchemaOf,
    TaskConfig,
    TaskContext,
    TaskDefinitionBase,
    TaskFn,
    TaskMetadata,
    TaskPayloadOf,
    TaskProducedOf,
    TaskSchema,
    TaskSchemas,
} from "./base";

export type { DAGId, DAGIdRegistry } from "./trigger";

export type {
    AnyBranchTaskDefinition,
    AnyDelayTaskDefinition,
    AnySensorTaskDefinition,
    AnyShortCircuitTaskDefinition,
    AnyTaskDefinition,
    AnyTriggerTaskDefinition,
    RegisteredTaskDefinition,
} from "./definitions";

export type {
    BranchChoice,
    BranchChooser,
    BranchTaskDefinition,
    BranchTaskInput,
    CreateBranch,
} from "./branch";

export type { CreateDelay, DelayTaskDefinition, DelayTaskInput } from "./delay";

export type {
    CreateSensor,
    SensorPredicate,
    SensorTaskDefinition,
    SensorTaskInput,
} from "./sensor";

export type {
    CreateShortCircuit,
    ShortCircuitCondition,
    ShortCircuitTaskDefinition,
    ShortCircuitTaskInput,
} from "./short-circuit";

export type { CreateTask, TaskParamInput, TaskParamOutput } from "./task";

export type {
    CreateTrigger,
    TriggerTaskDefinition,
    TriggerTaskInput,
} from "./trigger";
