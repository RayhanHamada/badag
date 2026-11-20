import { branch, createDAG, sensor, task } from "@badag/sdk";

export const REGIONS = ["us", "eu"] as const;

/**
 * Author the daily-pricing DAG. Edit this file to experiment with the
 * Airflow dialect.
 */
export function buildPricingDAG() {
    const sourceReady = sensor("source-ready", {
        description: "Wait for the vendor price drop",
        predicate: () => true,
        pokeIntervalMs: 60_000,
    });

    const extract = task("extract", {
        config: { owner: "pricing" },
        run: async () => [
            { region: "us", price: 120 },
            { region: "eu", price: 110 },
        ],
    });

    const route = branch("route", {
        branches: REGIONS,
        choose: () => "us",
    });

    const us = task("us", { run: () => "priced US" });
    const eu = task("eu", { run: () => "priced EU" });

    const publish = task("publish", {
        description: "Publish the selected region",
        triggerRule: "none_failed_min_one_success",
        run: () => "published",
    });

    return createDAG("daily-pricing")
        .parse`${sourceReady} >> ${extract} >> ${route}`
        .parse`${route} >> ${[us, eu]}`.parse`${[us, eu]} >> ${publish}`;
}
