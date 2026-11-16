import { PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

import {
    WORKFLOW_STEP_LIMIT,
    workflowOperationOptions,
} from "../workflow-spec";
import type { WorkflowOperation, WorkflowStep } from "../workflow-spec";

export interface EditableStep extends WorkflowStep {
    id: string;
}

interface StepsFieldProps {
    steps: EditableStep[];
    errors: { message?: string }[];
    onChange: (steps: EditableStep[]) => void;
}

function nextStepName(steps: readonly WorkflowStep[]): string {
    const names = new Set(steps.map((step) => step.name));
    let index = steps.length + 1;

    while (names.has(`step_${index}`)) {
        index += 1;
    }

    return `step_${index}`;
}

export const StepsField = ({ steps, errors, onChange }: StepsFieldProps) => {
    const updateStep = (id: string, patch: Partial<WorkflowStep>) => {
        onChange(
            steps.map((step) => (step.id === id ? { ...step, ...patch } : step))
        );
    };

    const removeStep = (id: string) => {
        onChange(steps.filter((step) => step.id !== id));
    };

    const addStep = () => {
        onChange([
            ...steps,
            {
                id: crypto.randomUUID(),
                name: nextStepName(steps),
                operation: "uppercase",
            },
        ]);
    };

    return (
        <div className="flex flex-col gap-2">
            {steps.map((step, index) => (
                <div className="flex items-center gap-2" key={step.id}>
                    <Input
                        aria-label={`Step ${index + 1} name`}
                        autoComplete="off"
                        className="min-w-0 flex-1"
                        maxLength={32}
                        onChange={(event) =>
                            updateStep(step.id, { name: event.target.value })
                        }
                        spellCheck={false}
                        value={step.name}
                    />
                    <Select
                        onValueChange={(value: WorkflowOperation | null) => {
                            if (value !== null) {
                                updateStep(step.id, { operation: value });
                            }
                        }}
                        value={step.operation}
                    >
                        <SelectTrigger
                            aria-label={`Operation for step ${index + 1}`}
                            className="w-36 shrink-0"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {workflowOperationOptions.map((option) => (
                                <SelectItem
                                    key={option.value}
                                    value={option.value}
                                >
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button
                        aria-label={`Remove step ${index + 1}`}
                        disabled={steps.length === 1}
                        onClick={() => removeStep(step.id)}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                    >
                        <Trash2Icon />
                    </Button>
                </div>
            ))}
            <div>
                <Button
                    disabled={steps.length >= WORKFLOW_STEP_LIMIT}
                    onClick={addStep}
                    size="sm"
                    type="button"
                    variant="outline"
                >
                    <PlusIcon data-icon="inline-start" />
                    Add step
                </Button>
            </div>
            <FieldError errors={errors} />
        </div>
    );
};
