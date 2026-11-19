import { describe, expect, it } from "vitest";

import type { TaskFn } from "../task/base";
import { task as createTask } from "../task/task";
import type { TaskParamInput, TaskParamOutput } from "../task/task";
import { createDAG } from "./dag";
import type { DAG } from "./dag";
import { crossDownstream } from "./registered-task";
import type { DAGTask } from "./registered-task";

function namesOf(dag: DAG): string[] {
    return dag.topologicalSort().map((task) => task.id);
}

function register<const Name extends string, Fn extends TaskFn<Name>>(
    dag: DAG,
    definition: TaskParamOutput<Name, Fn>
): DAGTask<Name> {
    expect(dag.parse`${definition}`).toBe(dag);

    const task = dag.getTask(definition.id);

    if (task === undefined) {
        throw new Error(`Task "${definition.id}" was not registered`);
    }

    return task;
}

function addTask<Fn extends TaskFn<string>>(
    dag: DAG,
    params: TaskParamInput<Fn> & { id: string }
): DAGTask {
    return register(dag, createTask(params.id, params));
}

describe("DAG ordering", () => {
    it("sorts a dependency chain", () => {
        const dag = createDAG("etl");
        const extract = addTask(dag, { id: "extract", fn: () => "raw" });

        const transform = addTask(dag, {
            id: "transform",
            fn: () => "clean",
        });

        const load = addTask(dag, { id: "load", fn: () => "stored" });

        extract.setDownstream(transform);
        transform.setDownstream(load);

        expect(namesOf(dag)).toStrictEqual(["extract", "transform", "load"]);
    });

    it("places fan-out and fan-in tasks between the ends", () => {
        const dag = createDAG("diamond");
        const root = addTask(dag, { id: "root", fn: () => 0 });
        const left = addTask(dag, { id: "left", fn: () => 0 });
        const right = addTask(dag, { id: "right", fn: () => 0 });
        const sink = addTask(dag, { id: "sink", fn: () => 0 });

        crossDownstream([root], [left, right]);
        crossDownstream([left, right], [sink]);

        const order = namesOf(dag);

        expect(order).toHaveLength(4);
        expect(order[0]).toBe("root");
        expect(order.at(-1)).toBe("sink");
    });

    it("rejects cycles and self dependencies", () => {
        const dag = createDAG("etl");
        const first = addTask(dag, { id: "first", fn: () => 0 });
        const second = addTask(dag, { id: "second", fn: () => 0 });

        first.setDownstream(second);

        expect(() => second.setDownstream(first)).toThrow(/creates a cycle/u);
        expect(() => first.setDownstream(first)).toThrow(
            /cannot depend on itself/u
        );
    });

    it("detects cycles reached through shared descendants", () => {
        const dag = createDAG("diamond");
        const root = addTask(dag, { id: "root", fn: () => 0 });
        const left = addTask(dag, { id: "left", fn: () => 0 });
        const right = addTask(dag, { id: "right", fn: () => 0 });
        const sink = addTask(dag, { id: "sink", fn: () => 0 });

        crossDownstream([root], [left, right]);
        crossDownstream([left, right], [sink]);

        expect(() => sink.setDownstream(root)).toThrow(/creates a cycle/u);
    });

    it("returns an empty order for an empty DAG", () => {
        expect(createDAG("empty").topologicalSort()).toStrictEqual([]);
    });

    it("returns the only task of a single-task DAG", () => {
        const dag = createDAG("single");
        const task = addTask(dag, { id: "only", fn: () => 0 });

        expect(dag.topologicalSort()).toStrictEqual([task]);
    });

    it("keeps registration order for independent tasks", () => {
        const dag = createDAG("flat");

        addTask(dag, { id: "zeta", fn: () => 0 });
        addTask(dag, { id: "alpha", fn: () => 0 });
        addTask(dag, { id: "mike", fn: () => 0 });

        expect(namesOf(dag)).toStrictEqual(["zeta", "alpha", "mike"]);
    });

    it("places every task after all of its upstreams", () => {
        const dag = createDAG("pipeline");

        const root = addTask(dag, { id: "A", fn: () => 0 });
        const left = addTask(dag, { id: "B", fn: () => 0 });
        const right = addTask(dag, { id: "C", fn: () => 0 });
        const leftPeer = addTask(dag, { id: "D", fn: () => 0 });
        const join = addTask(dag, { id: "E", fn: () => 0 });
        const sink = addTask(dag, { id: "F", fn: () => 0 });
        const rightPeer = addTask(dag, { id: "G", fn: () => 0 });

        expect(
            dag.parse`${root} >> ${[leftPeer, left]}`
                .parse`${leftPeer} >> ${join}`
                .parse`${left} >> ${[join, right, rightPeer]}`
                .parse`${right} >> ${rightPeer}`.parse`${join} >> ${sink}`
                .parse`${rightPeer} >> ${sink}`
        ).toBe(dag);

        const order = dag.topologicalSort();

        expect(order).toHaveLength(7);
        expect(order[0]).toBe(root);
        expect(order.at(-1)).toBe(sink);

        for (const task of order) {
            for (const upstream of task.upstream) {
                expect(order.indexOf(upstream)).toBeLessThan(
                    order.indexOf(task)
                );
            }
        }

        expect(namesOf(dag)).toStrictEqual(order.map((task) => task.id));
    });
});
