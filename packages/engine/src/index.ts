import type { BuiltDAG } from "@badag/core";

/**
 * What an engine executes: one immutable graph spec plus the build-local
 * implementations, keyed by node key.
 */
export type EngineInput = BuiltDAG;
