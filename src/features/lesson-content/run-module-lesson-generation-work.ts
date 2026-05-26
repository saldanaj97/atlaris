import type {
  GenerateModuleLessonsDeps,
  ModuleLessonGenerationWorkResult,
  RunModuleLessonGenerationAfterClaimParams,
} from '@/features/lesson-content/generate-module-lessons.types';
import type { ModuleLessonGenerationMetadata } from '@/shared/types/lesson-content.types';

import { resolveModelForTier } from '@/features/ai/model-resolver';
import { generateModuleLessonBatchWithInstrumentation } from '@/features/ai/orchestrator/provider-invocation';
import {
  cleanupTimeoutLifecycle,
  resolveTimeoutConfig,
  setupAbortAndTimeout,
} from '@/features/ai/orchestrator/timeout-lifecycle';
import { ParserError } from '@/features/ai/parser';
import { safeNormalizeUsage } from '@/features/ai/usage';
import {
  type LessonGenerationQuotaWorkResult,
  runLessonGenerationQuotaReserved,
} from '@/features/billing/lesson-generation-quota-boundary';
import {
  buildModuleLessonBatchSystemPrompt,
  buildModuleLessonBatchUserPrompt,
  type ModuleLessonBatchPromptInput,
} from '@/features/lesson-content/module-lesson-prompts';
import { parseModuleLessonBatchFromStream } from '@/features/lesson-content/parse-module-lesson-batch';
import { lessonContentEnv } from '@/lib/config/env/lesson-content';
import {
  commitModuleLessonBatchSuccess,
  commitModuleLessonGenerationFailure,
  revertModuleLessonGeneratingToNotGenerated,
} from '@/lib/db/queries/module-lesson-generation';
import { logger } from '@/lib/logging/logger';
import { db as serviceRoleDb } from '@supabase/service-role';

type LessonQuotaConsumed = { durationMs: number };
type LessonQuotaReverted = { kind: 'failed'; message: string };

function errorToPersistedMessage(error: unknown): string {
  if (error instanceof ParserError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Provider + quota + persist after a successful CAS claim. Safe for workflow replay
 * because it does not call `claimModuleLessonGenerationOrDescribe()`.
 */
export async function runModuleLessonGenerationWork(
  params: RunModuleLessonGenerationAfterClaimParams,
  deps: GenerateModuleLessonsDeps = {},
): Promise<ModuleLessonGenerationWorkResult> {
  if (!lessonContentEnv.generationEnabled) {
    return { kind: 'disabled' };
  }

  const clock = () => Date.now();
  const nowFn = params.now ?? (() => new Date());
  const timeoutConfig = resolveTimeoutConfig(params.timeoutConfig, clock);
  const runReserved =
    deps.runLessonQuotaReserved ?? runLessonGenerationQuotaReserved;
  const serverDbClient = deps.serverDbClient ?? serviceRoleDb;

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

  let quotaResult: Awaited<
    ReturnType<
      typeof runLessonGenerationQuotaReserved<
        LessonQuotaConsumed,
        LessonQuotaReverted
      >
    >
  >;

  try {
    quotaResult = await runReserved({
      userId: params.userId,
      planId: params.planId,
      moduleId: params.moduleId,
      dbClient: serverDbClient,
      work: async (): Promise<
        LessonGenerationQuotaWorkResult<
          LessonQuotaConsumed,
          LessonQuotaReverted
        >
      > => {
        const attemptClockStart = clock();
        let lifecycle: ReturnType<typeof setupAbortAndTimeout> | undefined;

        try {
          const provider =
            deps.provider ??
            resolveModelForTier(
              params.userTier,
              params.modelOverride ?? undefined,
            ).provider;

          lifecycle = setupAbortAndTimeout(timeoutConfig, params.signal);
          const { controller } = lifecycle;

          const batchInput = {
            systemPrompt,
            userPrompt,
            taskIds: expectedTaskIds,
          };

          const providerResult =
            await generateModuleLessonBatchWithInstrumentation(
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
            disposition: 'consumed',
            value: {
              durationMs: Math.max(0, clock() - attemptClockStart),
            },
          };
        } catch (error) {
          const message = errorToPersistedMessage(error);
          logger.warn(
            { err: error, planId: params.planId, moduleId: params.moduleId },
            'Module lesson batch generation failed',
          );

          try {
            await commitModuleLessonGenerationFailure(serverDbClient, {
              userId: params.userId,
              planId: params.planId,
              moduleId: params.moduleId,
              message,
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
            throw persistErr;
          }

          return {
            disposition: 'revert',
            value: { kind: 'failed' as const, message },
          };
        } finally {
          if (lifecycle) {
            cleanupTimeoutLifecycle({
              timeout: lifecycle.timeout,
              cleanupTimeoutAbort: lifecycle.cleanupTimeoutAbort,
              cleanupExternalAbort: lifecycle.cleanupExternalAbort,
            });
          }
        }
      },
    });
  } catch (error) {
    const message = errorToPersistedMessage(error);
    try {
      await revertModuleLessonGeneratingToNotGenerated(serverDbClient, {
        userId: params.userId,
        planId: params.planId,
        moduleId: params.moduleId,
      });
    } catch (revertErr) {
      logger.error(
        {
          err: revertErr,
          planId: params.planId,
          moduleId: params.moduleId,
        },
        'Failed to revert module after lesson quota reservation error',
      );
    }
    logger.warn(
      {
        err: error,
        planId: params.planId,
        moduleId: params.moduleId,
      },
      'Module lesson quota reservation failed',
    );
    return { kind: 'failed', message };
  }

  if (!quotaResult.ok) {
    try {
      await revertModuleLessonGeneratingToNotGenerated(serverDbClient, {
        userId: params.userId,
        planId: params.planId,
        moduleId: params.moduleId,
      });
    } catch (revertErr) {
      logger.error(
        {
          err: revertErr,
          planId: params.planId,
          moduleId: params.moduleId,
        },
        'Failed to revert module after lesson quota denial',
      );
    }
    return {
      kind: 'quota_denied',
      currentCount: quotaResult.currentCount,
      limit: quotaResult.limit,
    };
  }

  if (quotaResult.consumed) {
    return { kind: 'success', durationMs: quotaResult.value.durationMs };
  }

  if (quotaResult.reconciliationRequired) {
    logger.error(
      {
        planId: params.planId,
        moduleId: params.moduleId,
        userId: params.userId,
      },
      'Lesson generation quota compensation required reconciliation',
    );
  }

  return { kind: 'failed', message: quotaResult.value.message };
}

/** @deprecated Use `runModuleLessonGenerationWork`. */
export const runModuleLessonGenerationAfterClaim =
  runModuleLessonGenerationWork;
