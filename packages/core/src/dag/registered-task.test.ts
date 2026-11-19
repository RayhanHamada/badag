import { describe, expect, it } from "vitest";

import type { TaskFn } from "../task/base";
import { task as createTask } from "../task/task";
import type { TaskParamInput, TaskParamOutput } from "../task/task";
import { createDAG } from "./dag";
import type { DAG } from "./dag";
import { crossDownstream } from "./registered-task";
import type { DAGTask } from "./registered-task";

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

describe("cross-downstream linking", () => {
    it("links every pair across two groups", () => {
        const dag = createDAG("etl");
        const left = addTask(dag, { id: "left", fn: () => 0 });
        const leftPeer = addTask(dag, { id: "leftPeer", fn: () => 0 });
        const right = addTask(dag, { id: "right", fn: () => 0 });
        const rightPeer = addTask(dag, { id: "rightPeer", fn: () => 0 });

        crossDownstream([left, leftPeer], [right, rightPeer]);

        expect([...left.downstream]).toStrictEqual([right, rightPeer]);
        expect([...leftPeer.downstream]).toStrictEqual([right, rightPeer]);
        expect([...right.upstream]).toStrictEqual([left, leftPeer]);
        expect([...rightPeer.upstream]).toStrictEqual([left, leftPeer]);
    });

    it("does nothing when either group is empty", () => {
        const dag = createDAG("etl");
        const first = addTask(dag, { id: "first", fn: () => 0 });
        const second = addTask(dag, { id: "second", fn: () => 0 });

        crossDownstream([], [first, second]);
        crossDownstream([first, second], []);

        expect(first.upstream.size).toBe(0);
        expect(second.upstream.size).toBe(0);
        expect(first.downstream.size).toBe(0);
        expect(second.downstream.size).toBe(0);
    });

    it("does not add partial edges when a pair would cycle", () => {
        const dag = createDAG("etl");
        const left = addTask(dag, { id: "left", fn: () => 0 });
        const leftPeer = addTask(dag, { id: "leftPeer", fn: () => 0 });
        const right = addTask(dag, { id: "right", fn: () => 0 });

        right.setDownstream(leftPeer);

        expect(() => crossDownstream([left, leftPeer], [right])).toThrow(
            /creates a cycle/u
        );
        expect(left.downstream.size).toBe(0);
        expect(leftPeer.downstream.size).toBe(0);
        expect(right.upstream.size).toBe(0);
    });

    it("rejects handles from another DAG without linking", () => {
        const dag = createDAG("left");
        const other = createDAG("right");
        const left = addTask(dag, { id: "left", fn: () => 0 });
        const right = addTask(other, { id: "right", fn: () => 0 });

        expect(() => crossDownstream([left], [right])).toThrow(
            "Both tasks must belong to this DAG"
        );
        expect(left.downstream.size).toBe(0);
        expect(right.upstream.size).toBe(0);
    });
});

describe("dependency edges", () => {
    it("records both sides of an edge once", () => {
        const dag = createDAG("etl");
        const upstream = addTask(dag, { id: "upstream", fn: () => 0 });
        const downstream = addTask(dag, { id: "downstream", fn: () => 0 });

        dag.addDependency(upstream, downstream);
        dag.addDependency(upstream, downstream);

        expect([...upstream.downstream]).toStrictEqual([downstream]);
        expect([...downstream.upstream]).toStrictEqual([upstream]);
    });

    it("treats dependsOn as setUpstream", () => {
        const dag = createDAG("etl");
        const upstream = addTask(dag, { id: "upstream", fn: () => 0 });
        const downstream = addTask(dag, { id: "downstream", fn: () => 0 });

        downstream.dependsOn(upstream);

        expect([...downstream.upstream]).toStrictEqual([upstream]);
        expect([...upstream.downstream]).toStrictEqual([downstream]);
    });
});
