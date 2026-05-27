/**
 * Workflow SDK `'use workflow'` entrypoints require static step imports; tests
 * mock `@/features/plans/workflows/plan-regeneration.steps` via `vi.mock`.
 */
import type {
  PlanRegenerationWorkflowInput,
  PlanRegenerationWorkflowResult,
} from './plan-regeneration.types';

import {
  claimPlanRegenerationJobStep,
  finalizePlanRegenerationJobStep,
  processPlanRegenerationStep,
} from './plan-regeneration.steps';

export async function planRegenerationWorkflow(
  input: PlanRegenerationWorkflowInput,
): Promise<PlanRegenerationWorkflowResult> {
  'use workflow';

  const claim = await claimPlanRegenerationJobStep(input);
  if (claim.kind !== 'claimed') {
    return claim;
  }

  const generationResult = await processPlanRegenerationStep(input);
  return finalizePlanRegenerationJobStep(input, generationResult);
}
