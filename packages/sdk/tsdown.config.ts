import { defineConfig } from "tsdown";

export default defineConfig({
    tsconfig: "tsconfig.build.json",
    // The internal packages are source-only, so the SDK inlines them into the
    // published bundle instead of publishing them as runtime dependencies.
    deps: {
        alwaysBundle: [
            "@badag/airflow",
            "@badag/dag",
            "@badag/graph",
            "@badag/runtime",
        ],
        onlyBundle: ["@standard-schema/spec"],
    },
    dts: true,
    exports: true,
});
