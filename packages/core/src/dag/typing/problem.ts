/**
 * Public type-level entry points for `DAG.parse()`.
 *
 * Direction is deliberately not checked in `ParseProblem`: TypeScript cannot
 * read the literal `>>`/`<<` segments, so cycles, self edges, and branch
 * routing stay runtime checks.
 */

import type { CheckBranches } from "./branches";
import type {
    FlattenGroups,
    HasBroadIds,
    TooManyGroups,
    WiringGroup,
} from "./shared";
import type { RegisterAll } from "./signatures";

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
