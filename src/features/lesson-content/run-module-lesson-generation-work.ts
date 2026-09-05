import type {
  GenerateModuleLessonsDeps,
  ModuleLessonGenerationWorkResult,
  RunModuleLessonGenerationAfterClaimParams,
} from '@/features/lesson-content/generate-module-lessons.types';
import type { ModuleLessonGenerationMetadata } from '@/shared/types/lesson-content.types';

import { resolveOverrideOrSavedModelId } from '@/features/ai/model-preferences';
import { resolveModelForTier } from '@/features/ai/model-resolver';
import { generateModuleLessonBatchWithInstrumentation } from '@/features/ai/orchestrator/provider-invocation';
import {
  cleanupTimeoutLifecycle,
  resolveTimeoutConfig,
  setupAbortAndTimeout,
} from '@/features/ai/orchestrator/timeout-lifecycle';
import { safeNormalizeUsage } from '@/features/ai/usage';
import { resolveUserTier } from '@/features/billing/tier';
import { resolveModuleLessonGenerationEnabled } from '@/features/lesson-content/generation-flag';
import {
  buildModuleLessonBatchSystemPrompt,
  buildModuleLessonBatchUserPrompt,
  type ModuleLessonBatchPromptInput,
} from '@/features/lesson-content/module-lesson-prompts';
import { parseModuleLessonBatchFromStream } from '@/features/lesson-content/parse-module-lesson-batch';
import { readPlanContentAccess } from '@/features/plans/entitlement/access';
import {
  commitModuleLessonBatchSuccess,
  commitModuleLessonGenerationFailure,
  markModuleLessonProviderStarted,
  revertModuleLessonGeneratingToNotGenerated,
} from '@/lib/db/queries/module-lesson-generation';
import { getUserPreferences } from '@/lib/db/queries/user-preferences';
import { logger } from '@/lib/logging/logger';
import { db as serviceRoleDb } from '@supabase/service-role';

/**
 * Provider + persist after a successful CAS claim. Safe for workflow replay
 * because it does not call `claimModuleLessonGenerationOrDescribe()`.
 */
export async function runModuleLessonGenerationWork(
  params: RunModuleLessonGenerationAfterClaimParams,
  deps: GenerateModuleLessonsDeps = {},
): Promise<ModuleLessonGenerationWorkResult> {
  const serverDbClient = deps.serverDbClient ?? serviceRoleDb;
  const workflowRunId = params.generationMetadata?.workflow?.runId;
  const resolveGenerationEnabled =
    deps.resolveGenerationEnabled ?? resolveModuleLessonGenerationEnabled;

  if (!(await resolveGenerationEnabled())) {
    await revertModuleLessonGeneratingToNotGenerated(serverDbClient, {
      userId: params.userId,
      planId: params.planId,
      moduleId: params.moduleId,
      workflowRunId,
    });
    return { kind: 'disabled' };
  }

  const contentAccess = await readPlanContentAccess({
    userId: params.userId,
    planId: params.planId,
    dbClient: serverDbClient,
  });
  if (contentAccess !== 'full') {
    await revertModuleLessonGeneratingToNotGenerated(serverDbClient, {
      userId: params.userId,
      planId: params.planId,
      moduleId: params.moduleId,
      workflowRunId,
    });
    return { kind: 'failed' };
  }

  const clock = () => Date.now();
  const nowFn = params.now ?? (() => new Date());
  const timeoutConfig = resolveTimeoutConfig(params.timeoutConfig, clock);

  const expectedTaskIds = params.load.tasks.map((t) => t.id);
  const promptInput: ModuleLessonBatchPromptInput = {
    plan: {
      topic: params.load.plan.topic,
      skillLevel: params.load.plan.skillLevel,
      learningStyle: params.load.plan.learningStyle,
    },
    module: {
      title: params.load.module.title,
      description: params.load.module.description,
      order: params.load.module.order,
    },
    tasks: params.load.tasks.map((t) => ({
      taskId: t.id,
      order: t.order,
      title: t.title,
      description: t.description,
      estimatedMinutes: t.estimatedMinutes,
      hasMicroExplanation: t.hasMicroExplanation,
    })),
  };

  const systemPrompt = buildModuleLessonBatchSystemPrompt();
  const userPrompt = buildModuleLessonBatchUserPrompt(promptInput);
  const successMetadata: ModuleLessonGenerationMetadata = {
    version: 1,
    batchRequestId: params.generationMetadata?.batchRequestId,
    workflow: params.generationMetadata?.workflow
      ? {
          ...params.generationMetadata.workflow,
          completedAt: new Date().toISOString(),
        }
      : undefined,
  };

  const attemptClockStart = clock();
  let lifecycle: ReturnType<typeof setupAbortAndTimeout> | undefined;
  let providerStarted = false;

  try {
    const currentTier = await resolveUserTier(params.userId, serverDbClient);
    let requestedModel = params.modelOverride ?? undefined;
    if (requestedModel == null || requestedModel === '') {
      const saved = await getUserPreferences(params.userId, serverDbClient);
      requestedModel = resolveOverrideOrSavedModelId(
        undefined,
        currentTier,
        saved,
        'lesson',
      );
    }

    const provider =
      deps.provider ??
      resolveModelForTier(currentTier, requestedModel, 'lesson').provider;

    lifecycle = setupAbortAndTimeout(timeoutConfig, params.signal);
    const { controller } = lifecycle;

    const batchInput = {
      systemPrompt,
      userPrompt,
      taskIds: expectedTaskIds,
    };

    await markModuleLessonProviderStarted(serverDbClient, {
      userId: params.userId,
      planId: params.planId,
      moduleId: params.moduleId,
      providerStartedAt: nowFn().toISOString(),
    });
    providerStarted = true;

    const providerResult = await generateModuleLessonBatchWithInstrumentation(
      provider,
      batchInput,
      {
        signal: controller.signal,
        timeoutMs: timeoutConfig.baseMs,
      },
    );

    const parsed = await parseModuleLessonBatchFromStream(
      providerResult.stream,
      expectedTaskIds,
      { signal: controller.signal },
    );

    const usage = safeNormalizeUsage(providerResult.metadata);

    await commitModuleLessonBatchSuccess(serverDbClient, {
      userId: params.userId,
      planId: params.planId,
      moduleId: params.moduleId,
      parsed,
      metadata: successMetadata,
      usage,
      requestId: null,
      now: nowFn,
    });

    return {
      kind: 'success',
      durationMs: Math.max(0, clock() - attemptClockStart),
    };
  } catch (error) {
    logger.warn(
      { err: error, planId: params.planId, moduleId: params.moduleId },
      'Module lesson batch generation failed',
    );

    try {
      await commitModuleLessonGenerationFailure(serverDbClient, {
        userId: params.userId,
        planId: params.planId,
        moduleId: params.moduleId,
        now: nowFn,
      });
    } catch (persistErr) {
      logger.error(
        {
          err: persistErr,
          planId: params.planId,
          moduleId: params.moduleId,
        },
        'Failed to persist module lesson generation failure state',
      );
      if (!providerStarted) {
        try {
          await revertModuleLessonGeneratingToNotGenerated(serverDbClient, {
            userId: params.userId,
            planId: params.planId,
            moduleId: params.moduleId,
            workflowRunId,
          });
        } catch (revertErr) {
          logger.error(
            {
              err: revertErr,
              planId: params.planId,
              moduleId: params.moduleId,
            },
            'Failed to revert module after lesson generation error',
          );
        }
      }
    }

    return { kind: 'failed' };
  } finally {
    if (lifecycle) cleanupTimeoutLifecycle(lifecycle);
  }
}
