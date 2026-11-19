import { sameTaskBehavior } from "../task/identity";
import { findViolations } from "./audit";
import { assertBranchWiring } from "./branch-routing";
import {
    DAGTask,
    isDefinition,
    normalizeTasks,
    stateOf,
} from "./registered-task";
import type { TaskDefinition, TaskLike, TaskOrTasks } from "./registered-task";
import { serializeDAG } from "./serialization";
import type { DAGJson } from "./serialization";
import { sortTopologically } from "./topological-sort";
import type { NextBranches, ParseProblem, NextSignatures } from "./typing";
import type { DAGViolation } from "./violation";
import { parseWiringExpression } from "./wiring";
import type { WiringOperand } from "./wiring";

type TaskIdIndex = string;

/** One planned edge step: every task on the left upstream of every task on the right. */
type EdgeStep = readonly [readonly DAGTask[], readonly DAGTask[]];

/** One unresolved edge step: handles or definitions on either side. */
type PendingStep = readonly [readonly TaskLike[], readonly TaskLike[]];

/**
 * Optional metadata attached to a DAG at construction.
 */
export interface DAGMetadata {
    /**
     * Optional human-readable description.
     */
    readonly description?: string;
}

/**
 * An Airflow-inspired directed acyclic graph.
 *
 * `DagId`, `Signatures`, and `Branches` are compile-time bookkeeping for
 * `parse()`: the returned DAG carries the registrations and declared branch
 * sets added by the call. Keep calls fluent (or keep the returned value) for
 * static validation; the runtime checks cover every wiring path.
 */
export class DAG<
    DagId extends string = string,
    Signatures = Record<never, never>,
    Branches = Record<never, never>,
> {
    readonly #dagId: DagId;
    readonly #metadata: DAGMetadata;
    // Keyed by task id, the only task identifier; insertion order is
    // registration order.
    readonly #tasks = new Map<TaskIdIndex, DAGTask>();

    /**
     * Store the DAG id and metadata verbatim.
     *
     * The id is not rejected here; `validate()` reports an id that does not
     * follow Airflow's `dag_id` convention.
     */
    constructor(dagId: DagId, metadata?: DAGMetadata) {
        this.#dagId = dagId;
        this.#metadata = metadata ?? {};
    }

    /**
     * Airflow-style DAG id supplied when the DAG was constructed.
     */
    get dagId(): DagId {
        return this.#dagId;
    }

    /**
     * Metadata supplied when the DAG was constructed.
     */
    get metadata(): DAGMetadata {
        return this.#metadata;
    }

    /**
     * Registered tasks keyed by task id, in registration order.
     */
    get tasks(): ReadonlyMap<TaskIdIndex, DAGTask> {
        return this.#tasks;
    }

    /**
     * Look up a registered task by id.
     *
     * The returned task is typed with the queried id: tasks are keyed by their
     * own `id`, so any hit carries that literal type.
     */
    getTask<const Id extends TaskIdIndex>(id: Id): DAGTask<Id> | undefined {
        // SAFETY: #tasks is keyed by task.id, so a hit is always a DAGTask<Id>.
        return this.#tasks.get(id) as DAGTask<Id> | undefined;
    }

    /**
     * Add an edge: from -> to.
     *
     * Each side accepts a `DAGTask` handle or a definition. Definitions are
     * registered in this DAG on first use.
     */
    addDependency(from: TaskLike, to: TaskLike): void {
        this.addDependencies(from, to);
    }

    /**
     * Add every edge from `upstream` to `downstream`.
     *
     * The call is transactional: if any definition or edge is rejected, the
     * tasks and edges added by this call are rolled back.
     */
    addDependencies(upstream: TaskOrTasks, downstream: TaskOrTasks): void {
        const froms = normalizeTasks(upstream);
        const tos = normalizeTasks(downstream);

        if (froms.length === 0 || tos.length === 0) {
            return;
        }

        this.#applyBatch([...froms, ...tos], [[froms, tos]]);
    }

    /**
     * Wire tasks with Airflow-style bitshift notation.
     *
     * dag.parse`${a} >> ${b} >> ${c}`        => a -> b -> c
     * dag.parse`${a} >> ${b} << ${c}`        => a -> b, c -> b
     * dag.parse`${[a, c]} >> ${b}`           => a -> b, c -> b
     * dag.parse`${a}`                        => registers a, adds no edge
     *
     * Operators evaluate left to right and each result feeds the next, so
     * `${a} >> ${b} << ${c}` is the same graph as `${[a, c]} >> ${b}`.
     * Operands accept `DAGTask` handles and definitions alike; definitions are
     * registered on first use.
     *
     * One expression per call. A newline inside the template is rejected, so a
     * second expression needs a second call.
     *
     * This call is transactional: a rejected task, edge, or wiring step
     * leaves the task registry and the edges unchanged.
     *
     * The returned DAG carries the operands as compile-time signatures and
     * declared branch sets, so a later `parse()` call's duplicate-definition
     * check sees tasks registered here. It does not carry edges: TypeScript
     * cannot read the literal `>>`/`<<` segments, so edge direction is known
     * only at runtime. Cycles, self edges, cross-DAG handles, and branch
     * routing are therefore checked when the call runs.
     */
    parse<const Operands extends readonly WiringOperand[]>(
        segments: TemplateStringsArray,
        ...operands: Operands &
            (ParseProblem<DagId, Signatures, Branches, Operands> extends true
                ? unknown
                : ParseProblem<DagId, Signatures, Branches, Operands>)
    ): DAG<
        DagId,
        NextSignatures<DagId, Signatures, Operands>,
        NextBranches<DagId, Branches, Operands>
    >;
    parse(
        segments: TemplateStringsArray,
        ...operands: readonly WiringOperand[]
    ): this {
        const { steps, tasks } = parseWiringExpression(
            this.#dagId,
            segments,
            operands
        );

        this.#applyBatch(tasks, steps);

        // The overloads carry the accumulated signature and branch state; the
        // implementation only has to report the instance it mutated.
        return this;
    }

    /**
     * Return every problem in the graph without throwing.
     *
     * The wiring methods reject malformed graphs as they run, so a DAG built
     * only through them validates clean. This method exists for graphs that
     * reach a checkpoint later — a snapshot, a graph restored from storage, a
     * half-built DAG before execution — and for the states wiring cannot see at
     * the time of a call: a branch task registered alone declares the branches
     * it must route to, and only pairing it with those tasks satisfies that.
     *
     * Findings are ordered identifiers, edges, cycles, branch routing, then
     * triggers, and `subjects` names the values involved. An empty array means
     * the DAG id and every task id follow Airflow's `validate_key` convention,
     * the graph is acyclic, internally consistent, and every branch routes
     * exactly to its declared branches.
     */
    validate(): readonly DAGViolation[] {
        return findViolations(this.#dagId, [...this.#tasks.values()]);
    }

    /**
     * Return tasks in a valid topological execution order.
     * Throws if the graph is cyclic.
     */
    topologicalSort(): DAGTask[] {
        return sortTopologically(this.#tasks, this.#dagId);
    }

    /**
     * Return a JSON-safe snapshot of the graph.
     *
     * The snapshot keeps the DAG id and description; tasks keep their ids,
     * kinds, descriptions, trigger rules, configs, and serializable
     * kind-specific fields; edges are listed by task id. Functions are
     * omitted. `JSON.stringify(dag)` calls this method, so `config` values
     * must be JSON-serializable for that conversion.
     */
    toJSON(): DAGJson {
        return serializeDAG(this.#dagId, this.#metadata.description, [
            ...this.#tasks.values(),
        ]);
    }

    /**
     * Validate and apply one wiring batch as a transaction.
     *
     * Handles are checked before any definition is registered. A rejected
     * definition, edge, or branch route rolls back the tasks this call
     * inserted; tasks reused from earlier calls are untouched.
     */
    #applyBatch(
        operands: readonly TaskLike[],
        steps: readonly PendingStep[]
    ): void {
        for (const task of operands) {
            this.#assertHandleBelongs(task);
        }

        const inserted = this.#registerDefinitions(
            operands.filter(isDefinition)
        );

        try {
            const groups: EdgeStep[] = steps.map(([froms, tos]) => [
                froms.map((task) => this.#lookup(task)),
                tos.map((task) => this.#lookup(task)),
            ]);

            // Steps are independent edges, not a sequence of wiring sets: a
            // left-to-right expression must keep its direction, so each step
            // is validated on its own after the whole batch is planned.
            this.#addEdgeSteps(groups);
        } catch (error) {
            this.#removeTasks(inserted);
            throw error;
        }
    }

    #assertHandleBelongs(task: TaskLike): void {
        if (task instanceof DAGTask && this.#tasks.get(task.id) !== task) {
            throw new Error("Both tasks must belong to this DAG");
        }
    }

    /**
     * Register unseen definitions as one batch.
     *
     * Validation runs over the whole batch before any task is inserted. A
     * definition whose id is already registered is reused when it describes
     * the same behavior; otherwise the id is a conflict.
     */
    #registerDefinitions(
        definitions: readonly TaskDefinition[]
    ): readonly DAGTask[] {
        const pendingById = new Map<string, DAGTask>();
        const pending: DAGTask[] = [];

        for (const definition of definitions) {
            // SAFETY: task factories type kind-specific callbacks against this id.
            const candidate = new DAGTask(this, definition);

            const existing =
                this.#tasks.get(candidate.id) ?? pendingById.get(candidate.id);

            if (existing !== undefined) {
                this.#assertSameTask(existing, candidate);

                continue;
            }

            pendingById.set(candidate.id, candidate);
            pending.push(candidate);
        }

        for (const task of pending) {
            this.#tasks.set(task.id, task);
        }

        return pending;
    }

    /**
     * Reject a definition that reuses a task id with different behavior.
     *
     * The id is the task's only identifier, so a second, different definition
     * cannot be distinguished from the first; accepting it would silently drop
     * behavior. Metadata is ignored, so the first registration's metadata is
     * kept.
     */
    #assertSameTask(existing: DAGTask, candidate: DAGTask): void {
        if (sameTaskBehavior(existing.definition, candidate.definition)) {
            return;
        }

        throw new Error(
            `Task "${candidate.id}" already exists in DAG "${this.#dagId}" with different behavior; reuse the same definition or choose a different task id`
        );
    }

    /** Remove tasks inserted by a failed batch; reused tasks are untouched. */
    #removeTasks(tasks: readonly DAGTask[]): void {
        for (const task of tasks) {
            if (this.#tasks.get(task.id) === task) {
                this.#tasks.delete(task.id);
            }
        }
    }

    /** Resolve a handle or definition to its canonical task by task id. */
    #lookup(task: TaskLike): DAGTask {
        const registered = this.#tasks.get(task.id);

        if (registered === undefined) {
            throw new Error(
                `Task "${task.id}" is not registered in DAG "${this.#dagId}"`
            );
        }

        return registered;
    }

    /**
     * Validate and write a batch of independent edge steps.
     *
     * Steps keep their own direction; they are not chained to each other, so
     * `[a, b]` and `[c, b]` from notation like `a >> b << c` both apply.
     * Planning covers the whole batch before any edge is written; `added`
     * holds exactly the pairs that are not already present.
     */
    #addEdgeSteps(steps: readonly EdgeStep[]): void {
        const planned = new Map<DAGTask, Set<DAGTask>>();
        const added: (readonly [DAGTask, DAGTask])[] = [];

        for (const [froms, tos] of steps) {
            for (const from of froms) {
                for (const to of tos) {
                    if (from === to) {
                        throw new Error("A task cannot depend on itself");
                    }

                    const next = planned.get(from) ?? new Set(from.downstream);

                    if (next.has(to)) {
                        continue;
                    }

                    if (this.#hasPathIn(planned, to, from)) {
                        throw new Error(
                            `Dependency "${from.id}" -> "${to.id}" creates a cycle`
                        );
                    }

                    next.add(to);
                    planned.set(from, next);
                    added.push([from, to]);
                }
            }
        }

        for (const [froms, tos] of steps) {
            assertBranchWiring(froms, tos, planned);
        }

        for (const [from, to] of added) {
            stateOf(from).downstream.add(to);
            stateOf(to).upstream.add(from);
        }
    }

    #hasPathIn(
        planned: ReadonlyMap<DAGTask, ReadonlySet<DAGTask>>,
        from: DAGTask,
        target: DAGTask
    ): boolean {
        const visited = new Set<DAGTask>([from]);
        const pending: DAGTask[] = [from];
        let index = 0;

        while (index < pending.length) {
            const current = pending[index];
            index += 1;

            if (current === target) {
                return true;
            }

            const downstream = planned.get(current) ?? current.downstream;

            for (const next of downstream) {
                if (visited.has(next)) {
                    continue;
                }

                visited.add(next);
                pending.push(next);
            }
        }

        return false;
    }
}

/**
 * Create a DAG without `new`.
 *
 * Keeps the literal DAG id in the returned type, so `parse()` checks apply
 * exactly as they do on a constructed `DAG`. The id follows Airflow's
 * `dag_id` convention; `validate()` reports an id that does not.
 */
export const createDAG = <const DagId extends string>(
    dagId: DagId,
    metadata?: DAGMetadata
): DAG<DagId> => new DAG(dagId, metadata);
