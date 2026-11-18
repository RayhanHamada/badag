/** Type-level declared-branch checks for `DAG.parse()`. */

import type {
    WiringGroup,
    WiringTask,
    DuplicateTaskMessage,
    FlattenGroups,
    HasBroadIds,
    TaskIdOf,
    TooManyGroups,
} from "./shared";

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
export type CheckBranches<
    DagId extends string,
    Branches,
    Groups extends readonly WiringGroup[],
> =
    RegisterBranches<DagId, Branches, FlattenGroups<Groups>> extends infer Next
        ? Next extends string
            ? Next
            : true
        : true;
