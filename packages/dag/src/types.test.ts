import { describe, expect, expectTypeOf, it } from "vitest";

import { defineNode } from "./definition";
import { schema } from "./test-schema";
import type { MaybePromise, NodeContext } from "./types";

describe("node typing", () => {
    it("types the payload and result from the declared schemas", () => {
        const node = defineNode({
            key: "extract",
            type: "task",
            input: schema<string>(),
            output: schema<number>(),
            run: (ctx) => ctx.payload.length,
        });

        expectTypeOf(node.implementation.run)
            .parameter(0)
            .toEqualTypeOf<NodeContext<"extract", string>>();
        expectTypeOf(node.implementation.run).returns.toEqualTypeOf<
            MaybePromise<number>
        >();
    });

    it("uses an undefined payload and an unknown result without schemas", () => {
        const node = defineNode({
            key: "side",
            type: "task",
            run: (ctx) => {
                expectTypeOf(ctx.payload).toEqualTypeOf<undefined>();

                return 1;
            },
        });

        expectTypeOf(node.implementation.run).returns.toEqualTypeOf<
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
