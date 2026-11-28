import { wrapWorkflowBinding } from "@cloudflare/dynamic-workflows";

import type { DynamicWorkerDefinition } from "./definition";

// Loads (or reuses) the worker named by `definition` and hands it a Workflow
// binding that carries `definition` as metadata. Every `create()` the loaded
// worker makes is tagged with that definition, which is how the dispatcher
// finds the same module again when the run starts.
export function loadDynamicWorker(
    env: Env,
    definition: DynamicWorkerDefinition
) {
    return env.LOADER.get(definition.name, () => ({
        compatibilityDate: definition.compatibilityDate,
        mainModule: definition.mainModule,
        modules: definition.modules,
        env: {
            [definition.bindingName]: wrapWorkflowBinding(definition, {
                bindingName: definition.workflowBinding,
            }),
        },
        globalOutbound: null,
    }));
}
