import type { dispatchModuleLessonsToWorker } from '@/features/jobs/module-lessons-dispatch';

import { runModuleLessonGenerationWork } from '@/features/lesson-content/run-module-lesson-generation-work';
import {
  claimModuleLessonGenerationOrDescribe,
  loadModuleLessonGenerationContext,
} from '@/lib/db/queries/module-lesson-generation';
import { db } from '@supabase/service-role';
import { createId } from '@tests/fixtures/ids';

export type InlineModuleLessonsOutcome =
  | Awaited<ReturnType<typeof runModuleLessonGenerationWork>>
  | { readonly kind: 'in_flight' | 'already_ready' | 'not_found' };

/**
 * Stands in for the jobs Worker's module lessons Workflow in DB-backed tests.
 * Pass `dispatch` to `startModuleLessonGeneration`: it adopts the app's
 * provisional claim by `batchRequestId` (the Worker's claim step), then runs
 * the shared generation work against the test database. `outcome()` is what
 * the Workflow would have returned; it is undefined until a dispatch ran.
 */
export function createInlineModuleLessonsWorker() {
  let outcome: InlineModuleLessonsOutcome | undefined;

  const dispatch: typeof dispatchModuleLessonsToWorker = async (input) => {
    const instanceId = createId('wrun');
    const load = await loadModuleLessonGenerationContext(
      db,
      input.planId,
      input.moduleId,
      input.userId,
    );
    const workflow = {
      provider: 'cloudflare-workflow' as const,
      runId: instanceId,
      startedAt: new Date().toISOString(),
    };
    const claim = await claimModuleLessonGenerationOrDescribe(
      db,
      input.planId,
      input.moduleId,
      input.userId,
      { batchRequestId: input.batchRequestId, workflow },
    );
    if (claim.kind !== 'claimed' || !load) {
      outcome = { kind: claim.kind === 'claimed' ? 'not_found' : claim.kind };
    } else {
      outcome = await runModuleLessonGenerationWork(
        {
          load,
          userId: input.userId,
          planId: input.planId,
          moduleId: input.moduleId,
          modelOverride: input.modelOverride,
          generationMetadata: {
            version: 1,
            batchRequestId: input.batchRequestId,
            workflow: {
              ...workflow,
              startedAt: claim.workflowStartedAt ?? workflow.startedAt,
            },
          },
        },
        { serverDbClient: db },
      );
    }
    return { kind: 'accepted', instanceId };
  };

  return { dispatch, outcome: () => outcome };
}
