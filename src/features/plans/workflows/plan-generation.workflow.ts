/**
 * Workflow SDK `'use workflow'` entrypoints require static step imports; tests
 * mock `@/features/plans/workflows/plan-generation.steps` via `vi.mock`.
 */
import type {
  PlanGenerationWorkflowInput,
  PlanGenerationWorkflowResult,
} from './plan-generation.types';

import {
  persistPlanGenerationWorkflowMetadataStep,
  runPlanGenerationStep,
} from './plan-generation.steps';

export async function planGenerationWorkflow(
  input: PlanGenerationWorkflowInput,
): Promise<PlanGenerationWorkflowResult> {
  'use workflow';

  await persistPlanGenerationWorkflowMetadataStep(input);
  return runPlanGenerationStep(input);
}
