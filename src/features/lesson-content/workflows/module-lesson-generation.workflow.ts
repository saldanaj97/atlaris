import type {
  ModuleLessonWorkflowInput,
  ModuleLessonWorkflowResult,
} from './module-lesson-generation.types';

import {
  claimModuleLessonGenerationStep,
  runModuleLessonGenerationStep,
} from './module-lesson-generation.steps';

export type ModuleLessonGenerationWorkflowDeps = {
  readonly claim: typeof claimModuleLessonGenerationStep;
  readonly run: typeof runModuleLessonGenerationStep;
};

export function createModuleLessonGenerationWorkflow(
  deps: ModuleLessonGenerationWorkflowDeps,
): (input: ModuleLessonWorkflowInput) => Promise<ModuleLessonWorkflowResult> {
  return async function generatedModuleLessonGenerationWorkflow(
    input: ModuleLessonWorkflowInput,
  ): Promise<ModuleLessonWorkflowResult> {
    const claim = await deps.claim(input);
    if (claim.kind !== 'claimed') {
      return claim;
    }

    return deps.run(input, claim.load, claim.runId, claim.startedAt);
  };
}

const runModuleLessonGenerationWorkflow = createModuleLessonGenerationWorkflow({
  claim: claimModuleLessonGenerationStep,
  run: runModuleLessonGenerationStep,
});

export async function moduleLessonGenerationWorkflow(
  input: ModuleLessonWorkflowInput,
): Promise<ModuleLessonWorkflowResult> {
  'use workflow';

  return runModuleLessonGenerationWorkflow(input);
}
