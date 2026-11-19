import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { taskMetadata, taskSchemas } from "./definition";
import { TRIGGER_RULE_ENUM } from "./trigger-rule";

describe("task metadata", () => {
    it("defaults the trigger rule to all_success", () => {
        expect(taskMetadata({})).toStrictEqual({
            triggerRule: TRIGGER_RULE_ENUM.AllSuccess,
        });
    });

    it("preserves an explicit trigger rule", () => {
        expect(
            taskMetadata({ triggerRule: TRIGGER_RULE_ENUM.OneFailed })
        ).toStrictEqual({ triggerRule: TRIGGER_RULE_ENUM.OneFailed });
    });

    it("keeps a description and config when set", () => {
        const config = { retries: 1 };

        const metadata = taskMetadata({
            config,
            description: "loads raw rows",
        });

        expect(metadata.description).toBe("loads raw rows");
        expect(metadata.config).toBe(config);
        expect(metadata.triggerRule).toBe(TRIGGER_RULE_ENUM.AllSuccess);
    });

    it("omits absent description and config keys", () => {
        const metadata = taskMetadata({});

        expect(Object.hasOwn(metadata, "description")).toBeFalsy();
        expect(Object.hasOwn(metadata, "config")).toBeFalsy();
    });

    it("returns a fresh object detached from the input", () => {
        const input = { description: "original" };
        const metadata = taskMetadata(input);

        // SAFETY: the test mutates the result, so the readonly metadata view
        // is widened to a mutable one.
        const mutable = metadata as { description?: string };
        mutable.description = "changed";

        expect(metadata.description).toBe("changed");
        expect(input.description).toBe("original");
    });
});

describe("task schemas", () => {
    const input = v.object({ rows: v.number() });
    const output = v.string();

    it("keeps both schemas when declared", () => {
        const schemas = taskSchemas({ input, output });

        expect(schemas.input).toBe(input);
        expect(schemas.output).toBe(output);
    });

    it("keeps an input-only schema", () => {
        const schemas = taskSchemas({ input });

        expect(schemas.input).toBe(input);
        expect(Object.hasOwn(schemas, "output")).toBeFalsy();
    });

    it("keeps an output-only schema", () => {
        const schemas = taskSchemas({ output });

        expect(schemas.output).toBe(output);
        expect(Object.hasOwn(schemas, "input")).toBeFalsy();
    });

    it("omits both keys when no schema is declared", () => {
        const schemas = taskSchemas({});

        expect(Object.hasOwn(schemas, "input")).toBeFalsy();
        expect(Object.hasOwn(schemas, "output")).toBeFalsy();
        expect(schemas).toStrictEqual({});
    });

    it("returns a fresh schemas object detached from the input", () => {
        const source = { input };
        const schemas = taskSchemas(source);

        // SAFETY: the test mutates the result, so the readonly schema view is
        // widened to a mutable one.
        const mutable = schemas as { input?: typeof input };
        mutable.input = undefined;

        expect(schemas.input).toBeUndefined();
        expect(source.input).toBe(input);
    });
});
