/**
 * Type-level bookkeeping for `DAG.parse()`.
 *
 * A DAG carries the signatures and declared branch sets of the definitions
 * registered through `parse()`, so a later call's duplicate-definition check
 * sees tasks registered earlier. Direction is deliberately not checked:
 * TypeScript cannot read the literal `>>`/`<<` segments, so cycles, self edges,
 * and branch routing stay runtime checks.
 */

import type { TaskFn } from "../task/base";

// Structural helpers shared by the checks. Ids typed as plain `string`
// (generic helpers) skip the checks.

/** The structural shape the parse checks need from a handle or definition. */
export interface WiringTask {
    readonly id: string;
}

/** A task, or a wiring set. */
export type WiringGroup = WiringTask | readonly WiringTask[];

export type TaskIdOf<Task> = Task extends {
    readonly id: infer TaskId extends string;
}
    ? TaskId
    : never;

export type TaskFnOf<Task> = Task extends {
    readonly fn: infer Fn extends TaskFn<never>;
}
    ? Fn
    : TaskFn<never>;

export type GroupIds<Group> = TaskIdOf<
    Group extends readonly (infer Task)[] ? Task : Group
>;

/** All argument ids, including ids inside wiring sets. */
export type FlattenGroups<Groups extends readonly WiringGroup[]> =
    Groups extends readonly [
        infer Group extends WiringGroup,
        ...infer Rest extends readonly WiringGroup[],
    ]
        ? [
              ...(Group extends readonly WiringTask[] ? Group : [Group]),
              ...FlattenGroups<Rest>,
          ]
        : [];

export type HasBroadIds<Groups extends readonly WiringGroup[]> =
    string extends GroupIds<Groups[number]> ? true : false;

/**
 * Type-level registration is bounded. TypeScript hits its instantiation
 * depth around 46 operands, so calls with more than 40 operands skip the
 * static checks and rely on runtime validation.
 */
export type StaticCheckLength =
    | 0
    | 1
    | 2
    | 3
    | 4
    | 5
    | 6
    | 7
    | 8
    | 9
    | 10
    | 11
    | 12
    | 13
    | 14
    | 15
    | 16
    | 17
    | 18
    | 19
    | 20
    | 21
    | 22
    | 23
    | 24
    | 25
    | 26
    | 27
    | 28
    | 29
    | 30
    | 31
    | 32
    | 33
    | 34
    | 35
    | 36
    | 37
    | 38
    | 39
    | 40;

export type TooManyGroups<Groups extends readonly WiringGroup[]> =
    Groups["length"] extends StaticCheckLength ? false : true;

export type Equal<Left, Right> =
    (<Value>() => Value extends Left ? 1 : 2) extends <
        Value,
    >() => Value extends Right ? 1 : 2
        ? true
        : false;

/**
 * Whether a function type is too broad to compare signatures.
 *
 * `TaskFn` assignable to `Fn` means `Fn` exposes no more than the generic task
 * function, so a signature comparison would produce false duplicates.
 */
export type IsBroadFn<Fn extends TaskFn<never>> = TaskFn extends Fn
    ? true
    : false;

export type DagIdLabel<DagId extends string> = string extends DagId
    ? "this DAG"
    : DagId;

export type DuplicateTaskMessage<
    DagId extends string,
    TaskId extends string,
> = `Task "${TaskId}" already exists in DAG "${DagIdLabel<DagId>}"`;

// Signature registration.

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

// Declared branch registration.

/**
 * The declared branch names of a task, or `never` when it declares none.
 *
 * A branch whose `branches` set is omitted (or erased by a handle) carries
 * `readonly string[]`; that is not a declaration, so it opts out of the check.
 */
type DeclaredBranchesOf<Task> = "branches" extends keyof Task
    ? Task extends {
          readonly branches?: infer Branches extends readonly string[];
      }
        ? string extends Branches[number]
            ? never
            : Branches
        : never
    : never;

/**
 * Whether two declared branch sets are identical.
 *
 * Order matters: `["us", "eu"]` and `["eu", "us"]` are different behavior
 * sources, so runtime rejects the second as an id collision. The type check
 * must agree, or it would accept a call the runtime throws on.
 */
type SameBranchSet<Left, Right> = Left extends readonly string[]
    ? Right extends readonly string[]
        ? Left extends Right
            ? Right extends Left
                ? true
                : false
            : false
        : false
    : false;

/** Register every declared branch set in a flattened wiring expression. */
type RegisterBranches<
    DagId extends string,
    Branches,
    Tasks extends readonly WiringTask[],
> = Tasks extends readonly [
    infer Task extends WiringTask,
    ...infer Rest extends readonly WiringTask[],
]
    ? DeclaredBranchesOf<Task> extends infer Declared
        ? [Declared] extends [never]
            ? RegisterBranches<DagId, Branches, Rest>
            : TaskIdOf<Task> extends infer TaskId extends string
              ? TaskId extends keyof Branches
                  ? SameBranchSet<Branches[TaskId], Declared> extends true
                      ? RegisterBranches<DagId, Branches, Rest>
                      : DuplicateTaskMessage<DagId, TaskId>
                  : RegisterBranches<
                        DagId,
                        Branches & {
                            readonly [Name in TaskId]: Declared;
                        },
                        Rest
                    >
              : RegisterBranches<DagId, Branches, Rest>
        : never
    : Branches;

export type NextBranches<
    DagId extends string,
    Branches,
    Groups extends readonly WiringGroup[],
> =
    HasBroadIds<Groups> extends true
        ? Branches
        : TooManyGroups<Groups> extends true
          ? Branches
          : RegisterBranches<
                  DagId,
                  Branches,
                  FlattenGroups<Groups>
              > extends infer Next
            ? Next extends string
                ? Branches
                : Next
            : Branches;

/** The first problem registering a parse call's declared branch sets, or `true`. */
type CheckBranches<
    DagId extends string,
    Branches,
    Groups extends readonly WiringGroup[],
> =
    RegisterBranches<DagId, Branches, FlattenGroups<Groups>> extends infer Next
        ? Next extends string
            ? Next
            : true
        : true;

// Public type-level entry points for `DAG.parse()`.

/**
 * `true` when a wiring expression registers no conflicting signature or branch
 * set, otherwise the error message.
 */
export type ParseProblem<
    DagId extends string,
    Signatures,
    Branches,
    Operands extends readonly WiringGroup[],
> =
    HasBroadIds<Operands> extends true
        ? true
        : TooManyGroups<Operands> extends true
          ? true
          : CheckBranches<DagId, Branches, Operands> extends infer BranchError
            ? BranchError extends string
                ? BranchError
                : RegisterAll<
                        Signatures,
                        FlattenGroups<Operands>,
                        DagId
                    > extends infer Next
                  ? Next extends string
                      ? Next
                      : true
                  : never
            : never;
