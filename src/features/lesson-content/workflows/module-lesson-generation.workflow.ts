import type {
  ModuleLessonWorkflowInput,
  ModuleLessonWorkflowResult,
} from './module-lesson-generation.types';

import {
  claimModuleLessonGenerationStep,
  runModuleLessonGenerationStep,
} from './module-lesson-generation.steps';
/**
 * Workflow SDK `'use workflow'` entrypoints require static step imports; tests
 * mock `@/features/lesson-content/workflows/module-lesson-generation.steps`.
 */

export async function moduleLessonGenerationWorkflow(
  input: ModuleLessonWorkflowInput,
): Promise<ModuleLessonWorkflowResult> {
  'use workflow';

  const claim = await claimModuleLessonGenerationStep(input);
  if (claim.kind !== 'claimed') {
    return claim;
  }

  return runModuleLessonGenerationStep(input, claim.load, claim.runId);
}
