// Binding names shared by the loader and the dispatcher. `cloudflare.config.ts`
// cannot import this module (the Vite worker runner fails to resolve it from
// the config graph), so `DYNAMIC_WORKFLOW` there must be kept in sync by hand.
export const DYNAMIC_WORKFLOW_BINDING = "DYNAMIC_WORKFLOW";

// The key the loaded worker sees its wrapped Workflow binding on.
export const DEFAULT_DYNAMIC_WORKER_BINDING = "WORKFLOWS";
