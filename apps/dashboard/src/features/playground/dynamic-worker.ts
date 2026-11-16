import { defineDynamicWorker } from "@/integrations/dynamic-worker/definition";
import type { DynamicWorkerDefinition } from "@/integrations/dynamic-worker/definition";

import { buildTenantModuleSource } from "./workflow-spec";
import type { WorkflowSpec } from "./workflow-spec";

// Names the Worker Loader sees for the generated module.
const MAIN_MODULE_NAME = "tenant.js";
const ENTRYPOINT_NAME = "TenantWorkflow";

// Compiles a playground spec into the definition the universal dynamic-worker
// integration loads and dispatches. Everything feature-specific stops here.
export function definePlaygroundWorker(
    spec: WorkflowSpec
): Promise<DynamicWorkerDefinition> {
    return defineDynamicWorker({
        id: spec.tenantId,
        entrypoint: ENTRYPOINT_NAME,
        mainModule: MAIN_MODULE_NAME,
        modules: { [MAIN_MODULE_NAME]: buildTenantModuleSource(spec) },
    });
}
