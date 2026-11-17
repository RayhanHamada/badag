/**
 * Structural helpers shared by the type-level chain checks.
 *
 * A DAG carries the signatures of the definitions registered through
 * `chain()` and the edges added by it. Ids typed as plain `string` (generic
 * helpers) skip the checks.
 */

import type { TaskFn } from "../../task/types/base";

/** The structural shape the chain checks need from a handle or definition. */
export interface ChainTask {
    readonly id: string;
}

/** A task, or a wiring set. */
export type ChainGroup = ChainTask | readonly ChainTask[];

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
export type FlattenGroups<Groups extends readonly ChainGroup[]> =
    Groups extends readonly [
        infer Group extends ChainGroup,
        ...infer Rest extends readonly ChainGroup[],
    ]
        ? [
              ...(Group extends readonly ChainTask[] ? Group : [Group]),
              ...FlattenGroups<Rest>,
          ]
        : [];

export type HasBroadIds<Groups extends readonly ChainGroup[]> =
    string extends GroupIds<Groups[number]> ? true : false;

/**
 * Type-level graph walking is bounded. TypeScript hits its instantiation
 * depth around 46 wiring sets, so calls with more than 40 positional wiring
 * sets skip the static checks and rely on runtime validation.
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

export type TooManyGroups<Groups extends readonly ChainGroup[]> =
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
