/**
 * Branch tasks: types and the `branch()` factory.
 */

import { definedFields } from "../fields";
import type {
    AnySchema,
    MaybePromise,
    SchemaOf,
    TaskContext,
    TaskDefinitionBase,
    TaskMetadata,
    TaskPayloadOf,
    TaskSchemas,
} from "./base";
import { taskMetadata, taskSchemas } from "./definition";
import { normalizeTaskId } from "./id";
import type { TrimTaskId } from "./id";
import { TASK_KIND_ENUM } from "./kind";

/**
 * A branch name, or a set of branch names.
 */
export type BranchChoice<BranchName extends string> =
    | BranchName
    | readonly BranchName[];

/**
 * Chooses the downstream branch or branches for a branch task.
 */
export type BranchChooser<
    Id extends string = string,
    BranchName extends string = string,
    Payload = undefined,
> = (ctx: TaskContext<Id, Payload>) => MaybePromise<BranchChoice<BranchName>>;

/**
 * Input to the branch factory after the id.
 */
export interface BranchTaskInput<
    Id extends string = string,
    Branches extends readonly string[] = readonly string[],
    Input extends AnySchema = undefined,
    Output extends AnySchema = SchemaOf<BranchChoice<Branches[number]>>,
>
    extends TaskMetadata, TaskSchemas<Input, Output> {
    /**
     * Branch names this task may choose; inferred as a literal tuple so the
     * chooser and the produced value narrow to those names.
     */
    readonly branches?: Branches;
    /**
     * Chooses the branch or branches to run.
     */
    readonly choose: BranchChooser<Id, Branches[number], TaskPayloadOf<Input>>;
}

/**
 * A branch task definition.
 *
 * A branch produces the branch name or names it chose when no output schema is
 * declared.
 */
export interface BranchTaskDefinition<
    Id extends string = string,
    Branches extends readonly string[] = readonly string[],
    Input extends AnySchema = undefined,
    Output extends AnySchema = SchemaOf<BranchChoice<Branches[number]>>,
> extends TaskDefinitionBase<Id, typeof TASK_KIND_ENUM.Branch, Input, Output> {
    /**
     * Branch names this task may choose.
     */
    readonly branches?: Branches;
    /**
     * Chooses the branch or branches to run.
     */
    readonly choose: BranchChooser<Id, Branches[number], TaskPayloadOf<Input>>;
}

/**
 * Call signature of `branch()`.
 */
export type CreateBranch = <
    const Id extends string,
    const Branches extends readonly string[] = readonly string[],
    Input extends AnySchema = undefined,
    Output extends AnySchema = SchemaOf<BranchChoice<Branches[number]>>,
>(
    id: Id,
    input: BranchTaskInput<TrimTaskId<Id>, Branches, Input, Output>
) => BranchTaskDefinition<TrimTaskId<Id>, Branches, Input, Output>;

/**
 * Build a branch task definition.
 *
 * `choose` is stored on the definition and invoked by the task callback with
 * the task context. The returned branch name or names tell the scheduler which
 * downstream task(s) to run; the SDK itself does not prune edges.
 */
export function branch<
    const Id extends string,
    const Branches extends readonly string[] = readonly string[],
    Input extends AnySchema = undefined,
    Output extends AnySchema = SchemaOf<BranchChoice<Branches[number]>>,
>(
    id: Id,
    input: BranchTaskInput<TrimTaskId<Id>, Branches, Input, Output>
): BranchTaskDefinition<TrimTaskId<Id>, Branches, Input, Output> {
    return definedFields({
        kind: TASK_KIND_ENUM.Branch,
        id: normalizeTaskId(id),
        choose: input.choose,
        ...taskMetadata(input),
        ...taskSchemas(input),
        branches: input.branches,
    });
}
