import type { AiPlanGenerationProvider } from '@/features/ai/types/provider.types';
import type { AdaptiveTimeoutConfig } from '@/features/ai/types/timeout.types';
import type { DbClient } from '@/lib/db/types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

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
  claimModuleLessonGenerationOrDescribe,
  commitModuleLessonBatchSuccess,
  commitModuleLessonGenerationFailure,
  loadModuleLessonGenerationContext,
  revertModuleLessonGeneratingToNotGenerated,
} from '@/lib/db/queries/module-lesson-generation';
import { logger } from '@/lib/logging/logger';
import { db as serviceRoleDb } from '@supabase/service-role';

function errorToPersistedMessage(error: unknown): string {
  if (error instanceof ParserError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export type GenerateModuleLessonsParams = {
  readonly dbClient: DbClient;
  readonly userId: string;
  readonly planId: string;
  readonly moduleId: string;
  readonly userTier: SubscriptionTier;
  readonly modelOverride?: string | null;
  readonly signal?: AbortSignal;
  readonly timeoutConfig?: Partial<AdaptiveTimeoutConfig>;
  readonly now?: () => Date;
};

type LessonQuotaConsumed = { durationMs: number };
type LessonQuotaReverted = { kind: 'failed'; message: string };

export type GenerateModuleLessonsDeps = {
  readonly provider?: Pick<
    AiPlanGenerationProvider,
    'generateModuleLessonBatch'
  >;
  readonly runLessonQuotaReserved?: typeof runLessonGenerationQuotaReserved;
  readonly serverDbClient?: DbClient;
};

export type GenerateModuleLessonsResult =
  | { readonly kind: 'not_found' }
  | { readonly kind: 'locked' }
  | { readonly kind: 'already_ready' }
  | { readonly kind: 'in_flight' }
  | { readonly kind: 'disabled' }
  | {
      readonly kind: 'quota_denied';
      readonly currentCount: number;
      readonly limit: number;
    }
  | { readonly kind: 'success'; readonly durationMs: number }
  | { readonly kind: 'failed'; readonly message: string };

/**
 * Ownership-scoped module lesson batch: CAS → model/provider → parse → single transaction persist (tasks + module + usage).
 * On provider/parser failure after claim, persists `failed` without partial task writes.
 * Monthly lesson quota reserved only after successful claim; reverted on failure paths.
 */
export async function generateModuleLessons(
  params: GenerateModuleLessonsParams,
  deps: GenerateModuleLessonsDeps = {},
): Promise<GenerateModuleLessonsResult> {
  if (!lessonContentEnv.generationEnabled) {
    return { kind: 'disabled' };
  }

  const clock = () => Date.now();
  const nowFn = params.now ?? (() => new Date());
  const timeoutConfig = resolveTimeoutConfig(params.timeoutConfig, clock);
  const runReserved =
    deps.runLessonQuotaReserved ?? runLessonGenerationQuotaReserved;
  const serverDbClient = deps.serverDbClient ?? serviceRoleDb;

  const load = await loadModuleLessonGenerationContext(
    params.dbClient,
    params.planId,
    params.moduleId,
    params.userId,
  );

  if (!load) {
    return { kind: 'not_found' };
  }

  if (!load.isUnlocked) {
    return { kind: 'locked' };
  }

  const claim = await claimModuleLessonGenerationOrDescribe(
    serverDbClient,
    params.planId,
    params.moduleId,
    params.userId,
    nowFn,
  );

  if (claim.kind !== 'claimed') {
    return claim;
  }

  const expectedTaskIds = load.tasks.map((t) => t.id);
  const promptInput: ModuleLessonBatchPromptInput = {
    plan: {
      topic: load.plan.topic,
      skillLevel: load.plan.skillLevel,
      learningStyle: load.plan.learningStyle,
    },
    module: {
      title: load.module.title,
      description: load.module.description,
      order: load.module.order,
    },
    tasks: load.tasks.map((t) => ({
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
            metadata: { version: 1 },
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
