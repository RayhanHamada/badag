import { z } from "zod";

import {
    DEFAULT_DYNAMIC_WORKER_BINDING,
    DYNAMIC_WORKFLOW_BINDING,
} from "./constants";

// A dynamic worker is described entirely by serialisable data: the loader
// needs nothing else, and the same description travels as Workflow metadata,
// so it must survive a JSON round trip.
export const dynamicWorkerDefinitionSchema = z.object({
    // Loader cache key. `defineDynamicWorker` content-addresses it so identical
    // modules share one loaded worker.
    name: z.string().min(1),
    // Class exported by the loaded module that the dispatcher forwards `run()`
    // to.
    entrypoint: z.string().min(1),
    // Binding name the loaded worker sees its wrapped Workflow on.
    bindingName: z.string().min(1),
    // Workflow binding the dispatcher resolves on its own `env`; sourced from
    // `constants.ts`, which `cloudflare.config.ts` also imports.
    workflowBinding: z.string().min(1),
    // Loaded code runs inside the dispatcher's runtime, so it must not claim a
    // newer date than the host.
    compatibilityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    mainModule: z.string().min(1),
    modules: z.record(z.string(), z.string()),
});

export type DynamicWorkerDefinition = z.infer<
    typeof dynamicWorkerDefinitionSchema
>;

const DYNAMIC_WORKER_COMPATIBILITY_DATE = "2026-11-15";

export interface DynamicWorkerDescriptor {
    // Prefix for the loader cache key, e.g. a tenant id.
    id: string;
    entrypoint: string;
    bindingName?: string;
    mainModule: string;
    modules: Record<string, string>;
}

const encoder = new TextEncoder();

// SHA-256 over everything that shapes the loaded module, so a change in any
// module, the entrypoint, or the binding name forces a fresh loader entry.
async function fingerprint(descriptor: DynamicWorkerDescriptor) {
    // The key array is freshly created, so sorting it in place is safe and
    // keeps the hash independent of insertion order.
    // oxlint-disable-next-line unicorn/no-array-sort
    const moduleNames = Object.keys(descriptor.modules).sort();

    const canonical = JSON.stringify([
        descriptor.entrypoint,
        descriptor.bindingName ?? DEFAULT_DYNAMIC_WORKER_BINDING,
        DYNAMIC_WORKFLOW_BINDING,
        descriptor.mainModule,
        moduleNames.map((name) => [name, descriptor.modules[name]]),
    ]);

    const digest = await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(canonical)
    );

    return Array.from(new Uint8Array(digest).slice(0, 8), (byte) =>
        byte.toString(16).padStart(2, "0")
    ).join("");
}

// Turns module sources into the definition the loader and the dispatcher
// share. Features supply the code; this module owns the runtime contract.
export async function defineDynamicWorker(
    descriptor: DynamicWorkerDescriptor
): Promise<DynamicWorkerDefinition> {
    return {
        name: `${descriptor.id}-${await fingerprint(descriptor)}`,
        entrypoint: descriptor.entrypoint,
        bindingName: descriptor.bindingName ?? DEFAULT_DYNAMIC_WORKER_BINDING,
        workflowBinding: DYNAMIC_WORKFLOW_BINDING,
        compatibilityDate: DYNAMIC_WORKER_COMPATIBILITY_DATE,
        mainModule: descriptor.mainModule,
        modules: descriptor.modules,
    };
}
