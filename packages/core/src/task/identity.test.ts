import { describe, expect, it } from "vitest";

import { branch } from "./branch";
import { delay } from "./delay";
import { sameTaskBehavior } from "./identity";
import { sensor } from "./sensor";
import { shortCircuit } from "./short-circuit";
import { task } from "./task";
import { trigger } from "./trigger";

// Non-capturing callbacks are module-level so duplicate matching compares the
// same reference rather than a fresh closure per test.
const taskFn = () => 0;
const sensorPredicate = () => true;
const gateCondition = () => true;
const chooseUS = () => "us" as const;

describe("sameTaskBehavior callbacks", () => {
    it("compares a task callback by reference", () => {
        expect(
            sameTaskBehavior(
                task("work", { fn: taskFn }),
                task("work", { fn: taskFn })
            )
        ).toBeTruthy();
        expect(
            sameTaskBehavior(
                task("work", { fn: taskFn }),
                task("work", { fn: () => 0 })
            )
        ).toBeFalsy();
    });

    it("compares a sensor predicate by reference", () => {
        expect(
            sameTaskBehavior(
                sensor("ready", { predicate: sensorPredicate }),
                sensor("ready", { predicate: sensorPredicate })
            )
        ).toBeTruthy();
        expect(
            sameTaskBehavior(
                sensor("ready", { predicate: sensorPredicate }),
                sensor("ready", { predicate: () => true })
            )
        ).toBeFalsy();
    });

    it("compares a short-circuit condition by reference", () => {
        expect(
            sameTaskBehavior(
                shortCircuit("gate", { condition: gateCondition }),
                shortCircuit("gate", { condition: gateCondition })
            )
        ).toBeTruthy();
        expect(
            sameTaskBehavior(
                shortCircuit("gate", { condition: gateCondition }),
                shortCircuit("gate", { condition: () => true })
            )
        ).toBeFalsy();
    });
});

describe("sameTaskBehavior declarative kinds", () => {
    it("compares delay durations", () => {
        expect(
            sameTaskBehavior(
                delay("wait", { durationMs: 10 }),
                delay("wait", { durationMs: 10 })
            )
        ).toBeTruthy();
        expect(
            sameTaskBehavior(
                delay("wait", { durationMs: 10 }),
                delay("wait", { durationMs: 20 })
            )
        ).toBeFalsy();
    });

    it("compares a branch chooser and branch order", () => {
        expect(
            sameTaskBehavior(
                branch("route", { branches: ["us", "eu"], choose: chooseUS }),
                branch("route", { branches: ["us", "eu"], choose: chooseUS })
            )
        ).toBeTruthy();
        expect(
            sameTaskBehavior(
                branch("route", { branches: ["us", "eu"], choose: chooseUS }),
                branch("route", { branches: ["eu", "us"], choose: chooseUS })
            )
        ).toBeFalsy();
        expect(
            sameTaskBehavior(
                branch("route", { branches: ["us"], choose: chooseUS }),
                branch("route", { branches: ["us"], choose: () => "us" })
            )
        ).toBeFalsy();
    });

    it("compares a trigger target and wait flag", () => {
        expect(
            sameTaskBehavior(
                trigger("start", { dagId: "child" }),
                trigger("start", { dagId: "child" })
            )
        ).toBeTruthy();
        expect(
            sameTaskBehavior(
                trigger("start", { dagId: "child" }),
                trigger("start", { dagId: "other" })
            )
        ).toBeFalsy();
        expect(
            sameTaskBehavior(
                trigger("start", { dagId: "child" }),
                trigger("start", { dagId: "child", waitForCompletion: true })
            )
        ).toBeFalsy();
    });
});

describe("sameTaskBehavior across kinds", () => {
    it("is false for different kinds under one id", () => {
        expect(
            sameTaskBehavior(
                task("work", { fn: () => 0 }),
                sensor("work", { predicate: () => true })
            )
        ).toBeFalsy();
        expect(
            sameTaskBehavior(
                delay("work", { durationMs: 0 }),
                trigger("work", { dagId: "child" })
            )
        ).toBeFalsy();
    });
});
