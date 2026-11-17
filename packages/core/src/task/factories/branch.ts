import { taskMetadata } from "../definition/metadata";
import { taskSchemas } from "../definition/schemas";
import { normalizeTaskId } from "../definition/task-id";
import { TASK_KIND_ENUM } from "../kind";
import type { AnySchema, SchemaOf, TrimTaskId } from "../types/base";
import type {
    BranchChoice,
    BranchTaskDefinition,
    BranchTaskInput,
} from "../types/branch";

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
    const normalized = normalizeTaskId(id);
    const { branches } = input;

    const definition = {
        kind: TASK_KIND_ENUM.Branch,
        id: normalized,
        choose: input.choose,
        ...taskMetadata(input),
        ...taskSchemas(input),
    } satisfies BranchTaskDefinition<TrimTaskId<Id>, Branches, Input, Output>;

    return branches === undefined ? definition : { ...definition, branches };
}
