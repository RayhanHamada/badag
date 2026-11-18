import type { TASK_KIND_ENUM } from "../kind";
import type {
    AnySchema,
    MaybePromise,
    SchemaOf,
    TaskContext,
    TaskDefinitionBase,
    TaskMetadata,
    TaskPayloadOf,
    TaskSchemas,
    TrimTaskId,
} from "./base";

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
