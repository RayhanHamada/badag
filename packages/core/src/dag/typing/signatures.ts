/** Type-level registration of task signatures for `DAG.parse()`. */

import type { TaskFn } from "../../task/types/base";
import type {
    WiringGroup,
    WiringTask,
    DuplicateTaskMessage,
    Equal,
    FlattenGroups,
    HasBroadIds,
    IsBroadFn,
    TaskFnOf,
    TaskIdOf,
    TooManyGroups,
} from "./shared";

/** Successful registration of a definition signature. */
interface RegistrationOk<Signatures> {
    readonly error: never;
    readonly signatures: Signatures;
}

/** Failed registration; the message mirrors the runtime error. */
interface RegistrationError<Message extends string> {
    readonly error: Message;
    readonly signatures: never;
}

/**
 * Register one task signature.
 *
 * Handles exposed by the SDK carry `TaskFn`, so they are treated as opaque and
 * only contribute edges. A definition (or a handle with a known function type)
 * already registered with an equal signature is reused; a different signature
 * is the duplicate error.
 */
type RegisterTask<DagId extends string, Signatures, Task extends WiringTask> =
    IsBroadFn<TaskFnOf<Task>> extends true
        ? RegistrationOk<Signatures>
        : TaskIdOf<Task> extends infer TaskId extends string
          ? TaskId extends keyof Signatures
              ? IsBroadFn<Signatures[TaskId] & TaskFn> extends true
                  ? RegistrationOk<Signatures>
                  : Equal<TaskFnOf<Task>, Signatures[TaskId]> extends true
                    ? RegistrationOk<Signatures>
                    : RegistrationError<DuplicateTaskMessage<DagId, TaskId>>
              : RegistrationOk<
                    Signatures & {
                        readonly [Name in TaskId]: TaskFnOf<Task>;
                    }
                >
          : RegistrationOk<Signatures>;

/** Register every definition in a flattened wiring expression, stopping at the first error. */
export type RegisterAll<
    Signatures,
    Tasks extends readonly WiringTask[],
    DagId extends string,
> = Tasks extends readonly [
    infer Task extends WiringTask,
    ...infer Rest extends readonly WiringTask[],
]
    ? RegisterTask<DagId, Signatures, Task> extends {
          readonly error: infer Error;
          readonly signatures: infer Next;
      }
        ? [Error] extends [never]
            ? RegisterAll<Next, Rest, DagId>
            : Error
        : never
    : Signatures;

export type NextSignatures<
    DagId extends string,
    Signatures,
    Groups extends readonly WiringGroup[],
> =
    HasBroadIds<Groups> extends true
        ? Signatures
        : TooManyGroups<Groups> extends true
          ? Signatures
          : RegisterAll<
                  Signatures,
                  FlattenGroups<Groups>,
                  DagId
              > extends infer Next
            ? Next extends string
                ? Signatures
                : Next
            : Signatures;
