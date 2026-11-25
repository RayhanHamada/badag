import { describe, expect, expectTypeOf, it } from "vitest";

import { defineNode } from "./definition";
import { schema } from "./test-schema";
import type { MaybePromise, NodeContext } from "./types";

describe("node typing", () => {
    it("types the result from the declared output schema", () => {
        const node = defineNode({
            key: "extract",
            type: "task",
            output: schema<number>(),
            run: (ctx) => {
                expectTypeOf(ctx.key).toEqualTypeOf<"extract">();

                return 1;
            },
        });

        const { implementation } = node;

        if (implementation === undefined) {
            throw new Error("expected an implementation");
        }

        expectTypeOf(implementation.run)
            .parameter(0)
            .toEqualTypeOf<NodeContext<"extract">>();
        expectTypeOf(implementation.run).returns.toEqualTypeOf<
            MaybePromise<number>
        >();
    });

    it("uses an unknown result without an output schema", () => {
        const node = defineNode({
            key: "side",
            type: "task",
            run: (ctx) => {
                expectTypeOf(ctx.key).toEqualTypeOf<"side">();

                return 1;
            },
        });

        const { implementation } = node;

        if (implementation === undefined) {
            throw new Error("expected an implementation");
        }

        expectTypeOf(implementation.run).returns.toEqualTypeOf<
            MaybePromise<unknown>
        >();
    });

    it("rejects a result that does not match the output schema", () => {
        const node = defineNode({
            key: "bad",
            type: "task",
            output: schema<number>(),
            // @ts-expect-error the output schema requires a number
            run: () => "text",
        });

        expect(node.key).toBe("bad");
    });
});
