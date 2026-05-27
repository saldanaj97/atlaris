import type {
  PlanGenerationWorkflowInput,
  PlanGenerationWorkflowResult,
} from './plan-generation.types';

import {
  persistPlanGenerationWorkflowMetadataStep,
  runPlanGenerationStep,
} from './plan-generation.steps';

export type PlanGenerationWorkflowDeps = {
  readonly persistMetadata: typeof persistPlanGenerationWorkflowMetadataStep;
  readonly runGeneration: typeof runPlanGenerationStep;
};

export function createPlanGenerationWorkflow(
  deps: PlanGenerationWorkflowDeps,
): (
  input: PlanGenerationWorkflowInput,
) => Promise<PlanGenerationWorkflowResult> {
  return async function generatedPlanGenerationWorkflow(
    input: PlanGenerationWorkflowInput,
  ): Promise<PlanGenerationWorkflowResult> {
    await deps.persistMetadata(input);
    return deps.runGeneration(input);
  };
}

const runPlanGenerationWorkflow = createPlanGenerationWorkflow({
  persistMetadata: persistPlanGenerationWorkflowMetadataStep,
  runGeneration: runPlanGenerationStep,
});

export async function planGenerationWorkflow(
  input: PlanGenerationWorkflowInput,
): Promise<PlanGenerationWorkflowResult> {
  'use workflow';

  return runPlanGenerationWorkflow(input);
}
