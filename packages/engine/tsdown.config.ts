import { defineConfig } from "tsdown";

export default defineConfig({
    // Core is source-only, so its declarations are inlined into the bundle.
    deps: {
        alwaysBundle: ["@badag/core"],
        onlyBundle: ["@standard-schema/spec"],
    },
    dts: { generator: "oxc" },
    exports: true,
});
