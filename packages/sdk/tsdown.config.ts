import { defineConfig } from "tsdown";

export default defineConfig({
    tsconfig: "tsconfig.build.json",
    // The internal packages are source-only, so the SDK inlines them into the
    // published bundle instead of publishing them as runtime dependencies.
    deps: {
        alwaysBundle: ["@badag/dag-airflow", "@badag/core"],
        onlyBundle: ["@standard-schema/spec"],
    },
    dts: true,
    exports: true,
});
