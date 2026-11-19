import { describe, expect, it } from "vitest";

import { branch } from "../task/branch";
import { task as createTask } from "../task/task";
import { createDAG } from "./dag";
import type { DAG } from "./dag";
import { crossDownstream } from "./registered-task";
import type { DAGTask, TaskDefinition } from "./registered-task";

// These helpers erase literal names, so the checks under test are the runtime
// ones; the static channel is covered in public-api.test.ts.
function route(branches: readonly string[], name = "route"): TaskDefinition {
    return branch(name, { branches, choose: () => branches[0] ?? "" });
}

function unchecked(): TaskDefinition {
    return branch("free", { choose: () => "anything" });
}

function regular(name: string): TaskDefinition {
    return createTask(name, { fn: () => name });
}

function requireTask(dag: DAG, name: string): DAGTask {
    const task = dag.getTask(name);

    if (task === undefined) {
        throw new Error(`Task "${name}" was not registered`);
    }

    return task;
}

function downstreamNames(dag: DAG, name: string): string[] {
    return [...requireTask(dag, name).downstream].map((task) => task.id);
}

const UNDECLARED = 'Branch "route" cannot route to "apac"';

describe("branch wiring: accepted wiring", () => {
    it("routes to exactly the declared branches", () => {
        const dag = createDAG("ok");

        expect(
            dag.parse`${route(["us", "eu"])} >> ${[regular("us"), regular("eu")]}`
        ).toBe(dag);

        expect([...dag.tasks.keys()]).toStrictEqual(["route", "us", "eu"]);
        expect(downstreamNames(dag, "route")).toStrictEqual(["us", "eu"]);
    });

    it("ignores the order of targets inside the wiring set", () => {
        const dag = createDAG("order");

        expect(
            dag.parse`${route(["us", "eu"])} >> ${[regular("eu"), regular("us")]}`
        ).toBe(dag);

        expect(
            [...(dag.getTask("route")?.downstream ?? [])].map((t) => t.id)
        ).toStrictEqual(["eu", "us"]);
    });

    it("accepts a single declared branch", () => {
        const dag = createDAG("single");

        expect(dag.parse`${route(["us"])} >> ${regular("us")}`).toBe(dag);

        expect(downstreamNames(dag, "route")).toStrictEqual(["us"]);
    });

    it("constrains only the branch's own step, not later steps", () => {
        const dag = createDAG("tail");

        expect(
            dag.parse`${route(["us"])} >> ${regular("us")} >> ${regular("join")}`
        ).toBe(dag);

        expect(dag.topologicalSort().map((task) => task.id)).toStrictEqual([
            "route",
            "us",
            "join",
        ]);
    });

    it("allows a branch to be the downstream side of a step", () => {
        const dag = createDAG("mid");

        expect(
            dag.parse`${regular("extract")} >> ${route(["us"])} >> ${regular("us")}`
        ).toBe(dag);

        expect(downstreamNames(dag, "extract")).toStrictEqual(["route"]);
        expect(downstreamNames(dag, "route")).toStrictEqual(["us"]);
    });

    it("allows a branch to be a sink that routes nowhere", () => {
        const dag = createDAG("sink").parse`${route(["us", "eu"])}`;

        expect([...dag.tasks.keys()]).toStrictEqual(["route"]);
    });

    it("allows a declared branch that is never registered as a task", () => {
        const dag = createDAG("declaration-only");

        expect(dag.parse`${route(["us", "eu"])}`).toBe(dag);

        expect(requireTask(dag, "route").downstream.size).toBe(0);
    });

    it("leaves a branch without a declared set unchecked", () => {
        const dag = createDAG("free");

        expect(dag.parse`${unchecked()} >> ${regular("anything")}`).toBe(dag);

        expect(downstreamNames(dag, "free")).toStrictEqual(["anything"]);
    });

    it("validates each branch task in a shared upstream set", () => {
        const dag = createDAG("pair");

        expect(
            dag.parse`${[
                route(["us", "eu"], "first"),
                route(["us", "eu"], "second"),
            ]} >> ${[regular("us"), regular("eu")]}`
        ).toBe(dag);

        expect([...dag.tasks.keys()]).toStrictEqual([
            "first",
            "second",
            "us",
            "eu",
        ]);
        expect(downstreamNames(dag, "second")).toStrictEqual(["us", "eu"]);
    });

    it("rejects a shared upstream set when one branch declares a different set", () => {
        expect(
            () =>
                createDAG("mismatch").parse`${[
                    route(["us"], "first"),
                    route(["eu"], "second"),
                ]} >> ${[regular("us"), regular("eu")]}`
        ).toThrow('Branch "first" cannot route to "eu"');
    });

    it("tolerates a duplicated declared name", () => {
        const dag = createDAG("dup-declared");

        expect(dag.parse`${route(["us", "us"])} >> ${regular("us")}`).toBe(dag);

        expect(downstreamNames(dag, "route")).toStrictEqual(["us"]);
    });
});

describe("branch wiring: rejected wiring", () => {
    it("rejects an undeclared target in a later call", () => {
        const dag = createDAG("later").parse`${route(["us", "eu"])}`;

        expect(
            () => dag.parse`${requireTask(dag, "route")} >> ${regular("apac")}`
        ).toThrow(
            'Branch "route" cannot route to "apac"; declared branches are "us", "eu"'
        );
        expect(requireTask(dag, "route").downstream.size).toBe(0);
    });

    it("rejects an undeclared target inside the declaring call", () => {
        expect(
            () =>
                createDAG("one-call").parse`${route(["us"])} >> ${[
                    regular("us"),
                    regular("eu"),
                ]}`
        ).toThrow('Branch "route" cannot route to "eu"');
    });

    it("rejects the first undeclared target of several", () => {
        expect(
            () =>
                createDAG("many").parse`${route(["us"])} >> ${[
                    regular("us"),
                    regular("eu"),
                    regular("apac"),
                ]}`
        ).toThrow('Branch "route" cannot route to "eu"');
    });

    it("rejects a declared branch the step does not route to", () => {
        expect(
            () =>
                createDAG("missing")
                    .parse`${route(["us", "eu"])} >> ${regular("us")}`
        ).toThrow('Branch "route" must route to declared branch "eu"');
    });

    it("rejects a declared branch reached only through an intermediate task", () => {
        expect(
            () =>
                createDAG("hop")
                    .parse`${route(["us"])} >> ${regular("mid")} >> ${regular("us")}`
        ).toThrow('Branch "route" cannot route to "mid"');
    });

    it("rejects a split fan-out: the declaring call must be whole", () => {
        expect(
            () =>
                createDAG("split")
                    .parse`${route(["us", "eu"])} >> ${regular("us")}`
        ).toThrow('Branch "route" must route to declared branch "eu"');

        const dag = createDAG("split-halves");
        expect(dag.parse`${route(["us", "eu"])}`).toBe(dag);

        expect(
            () => dag.parse`${requireTask(dag, "route")} >> ${regular("us")}`
        ).toThrow('Branch "route" must route to declared branch "eu"');
    });

    it("rejects every target of a branch declaring none", () => {
        expect(
            () =>
                createDAG("empty-decl").parse`${route([])} >> ${regular("us")}`
        ).toThrow(
            'Branch "route" cannot route to "us"; it declares no branches'
        );
    });

    it("compares declared names case-sensitively", () => {
        expect(
            () => createDAG("case").parse`${route(["us"])} >> ${regular("US")}`
        ).toThrow('Branch "route" cannot route to "US"');
    });

    it("rejects a declared name that can never be a task id", () => {
        expect(
            () =>
                createDAG("bad-name")
                    .parse`${route(["us east"])} >> ${regular("us_east")}`
        ).toThrow(
            'Branch "route" cannot route to "us_east"; declared branches are "us east"'
        );
    });

    it("rejects an undeclared target through addDependency", () => {
        const dag = createDAG("single-edge").parse`${route(["us"])}`;

        expect(() =>
            dag.addDependency(requireTask(dag, "route"), regular("apac"))
        ).toThrow(UNDECLARED);
    });

    it("rejects an undeclared target through addDependencies", () => {
        const dag = createDAG("batch-edge").parse`${route(["us"])}`;
        const source = requireTask(dag, "route");
        const target = requireTask(dag.parse`${regular("apac")}`, "apac");

        expect(() => dag.addDependencies([source], [target])).toThrow(
            UNDECLARED
        );
    });

    it("rejects an undeclared target through the handle methods", () => {
        const dag = createDAG("handles").parse`${route(["us"])}`;
        const source = requireTask(dag, "route");
        const target = requireTask(dag.parse`${regular("apac")}`, "apac");

        expect(() => source.setDownstream(target)).toThrow(UNDECLARED);
        expect(() => target.setUpstream(source)).toThrow(UNDECLARED);
        expect(() => target.dependsOn(source)).toThrow(UNDECLARED);
    });

    it("rejects an undeclared target through crossDownstream", () => {
        const dag = createDAG("cross").parse`${route(["us"])}`;
        const source = requireTask(dag, "route");
        const target = requireTask(dag.parse`${regular("apac")}`, "apac");

        expect(() => crossDownstream([source], [target])).toThrow(UNDECLARED);
    });

    it("applies to a declared branch sharing the upstream set", () => {
        const dag = createDAG("mixed")
            .parse`${route(["us"])} >> ${regular("us")}`;

        expect(
            () =>
                dag.parse`${[requireTask(dag, "route"), unchecked()]} >> ${[
                    regular("other"),
                ]}`
        ).toThrow('Branch "route" cannot route to "other"');
    });

    it("rolls back the batch that fails the check", () => {
        const dag = createDAG("rollback").parse`${route(["us"])}`;

        expect(
            () => dag.parse`${requireTask(dag, "route")} >> ${regular("apac")}`
        ).toThrow(UNDECLARED);
        expect(dag.getTask("apac")).toBeUndefined();
        expect(requireTask(dag, "route").downstream.size).toBe(0);
    });
});

describe("branch wiring: precedence and repeats", () => {
    it("reports a self-edge before a branch problem", () => {
        const dag = createDAG("precedence");

        expect(dag.parse`${route(["us"])} >> ${regular("us")}`).toBe(dag);

        const group = [requireTask(dag, "route"), requireTask(dag, "us")];

        expect(() => dag.parse`${group} >> ${group}`).toThrow(
            "A task cannot depend on itself"
        );
    });

    it("reports a name collision before a branch problem", () => {
        expect(
            () =>
                createDAG("collision")
                    .parse`${route(["route"])} >> ${regular("route")}`
        ).toThrow('Task "route" already exists in DAG "collision"');
    });

    it("repeats a complete wiring step as a no-op", () => {
        const dag = createDAG("repeat");

        expect(
            dag.parse`${route(["us", "eu"])} >> ${[regular("us"), regular("eu")]}`
        ).toBe(dag);

        expect(
            dag.parse`${requireTask(dag, "route")} >> ${[
                requireTask(dag, "us"),
                requireTask(dag, "eu"),
            ]}`
        ).toBe(dag);

        expect(downstreamNames(dag, "route")).toStrictEqual(["us", "eu"]);
    });

    it("accepts a repeated partial step once the set is complete", () => {
        const dag = createDAG("repeat-partial");

        expect(
            dag.parse`${route(["us", "eu"])} >> ${[regular("us"), regular("eu")]}`
        ).toBe(dag);

        expect(
            dag.parse`${requireTask(dag, "route")} >> ${requireTask(dag, "us")}`
        ).toBe(dag);

        expect(requireTask(dag, "route").downstream.size).toBe(2);
    });

    it("treats a reordered declared set as different behavior", () => {
        const dag = createDAG("reorder").parse`${route(["us", "eu"])}`;

        expect(() => dag.parse`${route(["eu", "us"])}`).toThrow(
            'Task "route" already exists in DAG "reorder"'
        );
    });

    it("leaves serialization untouched", () => {
        const dag = createDAG("surfaces");

        expect(dag.parse`${route(["us"])} >> ${regular("us")}`).toBe(dag);

        const branchJson = dag
            .toJSON()
            .tasks.find((task) => task.id === "route");

        expect(branchJson?.downstream).toStrictEqual(["us"]);
    });
});
