import type { AiPlanGenerationProvider } from '@/features/ai/types/provider.types';
import type { AdaptiveTimeoutConfig } from '@/features/ai/types/timeout.types';
import type {
  GenerateModuleLessonsDeps,
  ModuleLessonGenerationWorkResult,
  RunModuleLessonGenerationAfterClaimParams,
} from '@/features/lesson-content/generate-module-lessons.types';
import type { ModuleLessonGenerationContext } from '@/lib/db/queries/module-lesson-generation';
import type { DbClient } from '@/lib/db/types';
import type { ProviderMetadata } from '@/shared/types/ai-provider.types';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';
import type { ModuleLessonGenerationMetadata } from '@/shared/types/lesson-content.types';

import {
  AI_DEFAULT_MODEL,
  getFallbackModelsForTier,
} from '@/features/ai/ai-models';
import { resolveOverrideOrSavedModelId } from '@/features/ai/model-preferences';
import { resolveModelForTier } from '@/features/ai/model-resolver';
import { generateModuleLessonBatchWithInstrumentation } from '@/features/ai/orchestrator/provider-invocation';
import {
  cleanupTimeoutLifecycle,
  resolveLessonTimeoutMs,
  resolveTimeoutConfig,
  setupAbortAndTimeout,
} from '@/features/ai/orchestrator/timeout-lifecycle';
import { getGenerationProviderWithModel } from '@/features/ai/providers/factory';
import { safeNormalizeUsage } from '@/features/ai/usage';
import { planAiCeilingMicrousd } from '@/features/billing/plan-ai-budget';
import { resolveUserTier } from '@/features/billing/tier';
import { resolveModuleLessonGenerationEnabled } from '@/features/lesson-content/generation-flag';
import {
  buildModuleLessonBatchUserPrompt,
  type ModuleLessonBatchPromptInput,
} from '@/features/lesson-content/module-lesson-prompts';
import {
  bufferModuleLessonBatchStream,
  parseModuleLessonBatchText,
} from '@/features/lesson-content/parse-module-lesson-batch';
import { readPlanContentAccess } from '@/features/plans/entitlement/access';
import {
  commitModuleLessonBatchSuccess,
  commitModuleLessonGenerationFailure,
  markModuleLessonProviderStarted,
  revertModuleLessonGeneratingToNotGenerated,
} from '@/lib/db/queries/module-lesson-generation';
import { sumPlanAiSpendMicrousd } from '@/lib/db/queries/plan-ai-budget';
import { getUserPreferences } from '@/lib/db/queries/user-preferences';
import { logger } from '@/lib/logging/logger';
import * as Sentry from '@sentry/nextjs';
import { db as serviceRoleDb } from '@supabase/service-role';

/** The owned module a claimed lesson generation run works on. */
export type ModuleLessonGenerationTarget = {
  readonly userId: string;
  readonly planId: string;
  readonly moduleId: string;
};

export type ModuleLessonProvider = Pick<
  AiPlanGenerationProvider,
  'generateModuleLessonBatch'
>;

export type ModuleLessonBatchInput = Parameters<
  ModuleLessonProvider['generateModuleLessonBatch']
>[0];

/** Buffered provider output, small enough to cross a Workflow step. */
export type ModuleLessonRawBatch = {
  readonly rawText: string;
  readonly usage: CanonicalAIUsage;
  /** Provider `finish_reason` when streamed (`length` means the output was cut off). */
  readonly finishReason?: string;
  /** A paid tier's lessons were served by the free router (DEV-175). */
  readonly freeRouterFallback?: true;
};

// --- prepare ---------------------------------------------------------------

/**
 * Flag and content-access checks that run before any provider work. The
 * caller reverts the claim when this is not `open`.
 */
export async function checkModuleLessonGenerationGate(
  target: ModuleLessonGenerationTarget,
  deps: {
    readonly dbClient: DbClient;
    readonly resolveGenerationEnabled?: () => Promise<boolean>;
  },
): Promise<'open' | 'disabled' | 'no_access'> {
  const resolveGenerationEnabled =
    deps.resolveGenerationEnabled ?? resolveModuleLessonGenerationEnabled;
  if (!(await resolveGenerationEnabled())) {
    return 'disabled';
  }

  const contentAccess = await readPlanContentAccess({
    userId: target.userId,
    planId: target.planId,
    dbClient: deps.dbClient,
  });
  return contentAccess === 'full' ? 'open' : 'no_access';
}

export function buildModuleLessonBatchPromptInput(
  load: ModuleLessonGenerationContext,
): ModuleLessonBatchPromptInput {
  return {
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
}

export function buildModuleLessonBatchInput(
  promptInput: ModuleLessonBatchPromptInput,
): ModuleLessonBatchInput {
  return {
    userPrompt: buildModuleLessonBatchUserPrompt(promptInput),
    taskIds: promptInput.tasks.map((t) => t.taskId),
  };
}

/** The resolved route's tier and models; absent for an injected provider. */
export type ModuleLessonRoute = {
  readonly tier: SubscriptionTier;
  readonly primaryModelId: string;
  readonly fallbackModelIds: readonly string[];
  /** The primary is the free router only because the guardrail left no paid default. */
  readonly freeRouterFallback?: true;
};

export type ModuleLessonProviderResolution = {
  readonly provider: ModuleLessonProvider;
  readonly route?: ModuleLessonRoute;
};

/**
 * Current tier, then the explicit override or the saved lesson model. A paid
 * plan at its AI ceiling (JCS-170) runs the lesson on the free router.
 */
export async function resolveModuleLessonProvider(
  params: {
    readonly userId: string;
    readonly planId: string;
    readonly modelOverride?: string | null;
  },
  dbClient: DbClient,
  provider?: ModuleLessonProvider,
): Promise<ModuleLessonProviderResolution> {
  const currentTier = await resolveUserTier(params.userId, dbClient);
  let requestedModel = params.modelOverride ?? undefined;
  if (requestedModel == null || requestedModel === '') {
    const saved = await getUserPreferences(params.userId, dbClient);
    requestedModel = resolveOverrideOrSavedModelId(
      undefined,
      currentTier,
      saved,
      'lesson',
    );
  }

  if (provider) {
    return { provider };
  }

  if (currentTier !== 'free') {
    const spentMicrousd = await sumPlanAiSpendMicrousd(params.planId, dbClient);
    if (spentMicrousd >= planAiCeilingMicrousd(currentTier)) {
      logger.warn(
        {
          event: 'plan_ai_ceiling_lesson_free_router',
          tier: currentTier,
          planId: params.planId,
          spentMicrousd,
        },
        'Plan reached its AI ceiling; running the lesson on the free router',
      );
      return {
        provider: getGenerationProviderWithModel(
          AI_DEFAULT_MODEL,
          currentTier,
          'lesson',
        ),
        route: {
          tier: currentTier,
          primaryModelId: AI_DEFAULT_MODEL,
          fallbackModelIds: [],
        },
      };
    }
  }

  const resolution = await resolveModelForTier(
    currentTier,
    requestedModel,
    'lesson',
  );
  return {
    provider: resolution.provider,
    route: {
      tier: currentTier,
      primaryModelId: resolution.modelId,
      fallbackModelIds: getFallbackModelsForTier(
        currentTier,
        resolution.modelId,
        'lesson',
      ),
      ...(resolution.freeRouterFallback ? { freeRouterFallback: true } : {}),
    },
  };
}

/** Matches a dated snapshot suffix such as `-20261001` or `-2026-10-01`. */
const DATED_SNAPSHOT_SUFFIX = /^-\d{4}-?\d{2}-?\d{2}$/;

/** The served slug is the primary itself or a dated snapshot of it. */
function isServedAsPrimary(servedModel: string, primaryModelId: string) {
  return (
    servedModel === primaryModelId ||
    (servedModel.startsWith(primaryModelId) &&
      DATED_SNAPSHOT_SUFFIX.test(servedModel.slice(primaryModelId.length)))
  );
}

/**
 * Warns when OpenRouter served a paid-tier lesson from a fallback route model
 * instead of the resolved primary (DEV-180). Only routes that list fallbacks
 * qualify; a free-router fallback serves a concrete `:free` model, so the
 * served name is compared with the primary, not the fallback list. Returns
 * whether it warned.
 */
export function reportLessonRouteFallback(
  route: ModuleLessonRoute | undefined,
  metadata: Pick<ProviderMetadata, 'provider' | 'model'>,
): boolean {
  const servedModel = metadata.model;
  if (
    !route ||
    route.tier === 'free' ||
    route.fallbackModelIds.length === 0 ||
    metadata.provider !== 'openrouter' ||
    !servedModel ||
    isServedAsPrimary(servedModel, route.primaryModelId)
  ) {
    return false;
  }
  const fields = {
    event: 'lesson_route_fallback',
    tier: route.tier,
    primaryModelId: route.primaryModelId,
    servedModel,
  };
  logger.warn(fields, 'Lesson was served by a fallback route model');
  Sentry.captureMessage('Lesson was served by a fallback route model', {
    level: 'warning',
    fingerprint: ['lesson_route_fallback', route.tier],
    tags: { event: fields.event, tier: route.tier },
    extra: fields,
  });
  return true;
}

/**
 * Whether a paid-tier lesson ran on the free router: its guardrail left no
 * paid default, or OpenRouter served it from a route whose only fallback is
 * the free router ({@link reportLessonRouteFallback} returned true).
 */
export function lessonServedByFreeRouterFallback(
  route: ModuleLessonRoute | undefined,
  servedByRouteFallback: boolean,
): boolean {
  if (!route || route.tier === 'free') {
    return false;
  }
  return (
    route.freeRouterFallback === true ||
    (servedByRouteFallback &&
      route.fallbackModelIds.every((modelId) => modelId === AI_DEFAULT_MODEL))
  );
}

// --- provider --------------------------------------------------------------

/**
 * Marks the provider started, calls it, and buffers the stream into raw text
 * (capped at `MAX_RAW_RESPONSE_CHARS`). `onProviderStarted` fires once the
 * marker is persisted; after that a failure must not revert the claim.
 */
export async function generateModuleLessonRawBatch(input: {
  readonly target: ModuleLessonGenerationTarget;
  readonly batchInput: ModuleLessonBatchInput;
  readonly provider: ModuleLessonProvider;
  readonly route?: ModuleLessonRoute;
  readonly dbClient: DbClient;
  readonly timeoutConfig: AdaptiveTimeoutConfig;
  readonly now: () => Date;
  readonly signal?: AbortSignal;
  readonly onProviderStarted?: () => void;
}): Promise<ModuleLessonRawBatch> {
  const lifecycle = setupAbortAndTimeout(input.timeoutConfig, input.signal);
  try {
    const { controller } = lifecycle;

    await markModuleLessonProviderStarted(input.dbClient, {
      ...input.target,
      providerStartedAt: input.now().toISOString(),
    });
    input.onProviderStarted?.();

    const providerResult = await generateModuleLessonBatchWithInstrumentation(
      input.provider,
      input.batchInput,
      {
        signal: controller.signal,
        timeoutMs: input.timeoutConfig.baseMs,
      },
    );

    const rawText = await bufferModuleLessonBatchStream(providerResult.stream, {
      signal: controller.signal,
    });
    const freeRouterFallback = lessonServedByFreeRouterFallback(
      input.route,
      reportLessonRouteFallback(input.route, providerResult.metadata),
    );

    return {
      rawText,
      usage: await safeNormalizeUsage(providerResult.metadata),
      finishReason: providerResult.metadata.finishReason,
      ...(freeRouterFallback ? { freeRouterFallback: true } : {}),
    };
  } finally {
    cleanupTimeoutLifecycle(lifecycle);
  }
}

// --- persist ---------------------------------------------------------------

/**
 * Parses buffered text against the prompt's task order, then commits. A
 * free-router batch marks the module's metadata for the plan page notice.
 */
export async function persistModuleLessonBatch(input: {
  readonly target: ModuleLessonGenerationTarget;
  readonly batch: Pick<
    ModuleLessonRawBatch,
    'rawText' | 'usage' | 'freeRouterFallback'
  >;
  readonly expectedTaskIds: readonly string[];
  readonly metadata: ModuleLessonGenerationMetadata;
  readonly dbClient: DbClient;
  readonly now: () => Date;
}): Promise<void> {
  const parsed = parseModuleLessonBatchText(
    input.batch.rawText,
    input.expectedTaskIds,
  );

  await commitModuleLessonBatchSuccess(input.dbClient, {
    ...input.target,
    parsed,
    metadata: input.batch.freeRouterFallback
      ? { ...input.metadata, freeRouterFallback: true }
      : input.metadata,
    usage: input.batch.usage,
    requestId: null,
    now: input.now,
  });
}

// --- failure ---------------------------------------------------------------

/**
 * Marks the module `failed`. If that write fails and the provider never
 * started, reverts the claim instead. Never throws.
 */
export async function recordModuleLessonGenerationFailure(input: {
  readonly target: ModuleLessonGenerationTarget;
  readonly dbClient: DbClient;
  readonly now: () => Date;
  readonly providerStarted: boolean;
  readonly workflowRunId?: string;
}): Promise<void> {
  const { target } = input;
  try {
    await commitModuleLessonGenerationFailure(input.dbClient, {
      ...target,
      now: input.now,
    });
  } catch (persistErr) {
    logger.error(
      {
        err: persistErr,
        planId: target.planId,
        moduleId: target.moduleId,
      },
      'Failed to persist module lesson generation failure state',
    );
    if (!input.providerStarted) {
      try {
        await revertModuleLessonGeneratingToNotGenerated(input.dbClient, {
          ...target,
          workflowRunId: input.workflowRunId,
        });
      } catch (revertErr) {
        logger.error(
          {
            err: revertErr,
            planId: target.planId,
            moduleId: target.moduleId,
          },
          'Failed to revert module after lesson generation error',
        );
      }
    }
  }
}

// --- composition -----------------------------------------------------------

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
  const target: ModuleLessonGenerationTarget = {
    userId: params.userId,
    planId: params.planId,
    moduleId: params.moduleId,
  };

  const gate = await checkModuleLessonGenerationGate(target, {
    dbClient: serverDbClient,
    resolveGenerationEnabled: deps.resolveGenerationEnabled,
  });
  if (gate !== 'open') {
    await revertModuleLessonGeneratingToNotGenerated(serverDbClient, {
      ...target,
      workflowRunId,
    });
    return { kind: gate === 'disabled' ? 'disabled' : 'failed' };
  }

  const clock = () => Date.now();
  const nowFn = params.now ?? (() => new Date());
  const timeoutConfig = resolveTimeoutConfig(
    { baseMs: resolveLessonTimeoutMs(), ...params.timeoutConfig },
    clock,
  );

  const batchInput = buildModuleLessonBatchInput(
    buildModuleLessonBatchPromptInput(params.load),
  );
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
  let providerStarted = false;

  try {
    const { provider, route } = await resolveModuleLessonProvider(
      params,
      serverDbClient,
      deps.provider,
    );

    const batch = await generateModuleLessonRawBatch({
      target,
      batchInput,
      provider,
      route,
      dbClient: serverDbClient,
      timeoutConfig,
      now: nowFn,
      signal: params.signal,
      onProviderStarted: () => {
        providerStarted = true;
      },
    });

    await persistModuleLessonBatch({
      target,
      batch,
      expectedTaskIds: batchInput.taskIds,
      metadata: successMetadata,
      dbClient: serverDbClient,
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

    await recordModuleLessonGenerationFailure({
      target,
      dbClient: serverDbClient,
      now: nowFn,
      providerStarted,
      workflowRunId,
    });

    return { kind: 'failed' };
  }
}
