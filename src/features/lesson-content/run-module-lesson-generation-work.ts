import type { AiPlanGenerationProvider } from '@/features/ai/types/provider.types';
import type { AdaptiveTimeoutConfig } from '@/features/ai/types/timeout.types';
import type {
  GenerateModuleLessonsDeps,
  ModuleLessonGenerationWorkResult,
  RunModuleLessonGenerationAfterClaimParams,
} from '@/features/lesson-content/generate-module-lessons.types';
import type { ModuleLessonGenerationContext } from '@/lib/db/queries/module-lesson-generation';
import type { DbClient } from '@/lib/db/types';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';
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
import { getUserPreferences } from '@/lib/db/queries/user-preferences';
import { logger } from '@/lib/logging/logger';
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
    systemPrompt: buildModuleLessonBatchSystemPrompt(),
    userPrompt: buildModuleLessonBatchUserPrompt(promptInput),
    taskIds: promptInput.tasks.map((t) => t.taskId),
  };
}

/** Current tier, then the explicit override or the saved lesson model. */
export async function resolveModuleLessonProvider(
  params: { readonly userId: string; readonly modelOverride?: string | null },
  dbClient: DbClient,
  provider?: ModuleLessonProvider,
): Promise<ModuleLessonProvider> {
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

  return (
    provider ??
    resolveModelForTier(currentTier, requestedModel, 'lesson').provider
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

    return { rawText, usage: safeNormalizeUsage(providerResult.metadata) };
  } finally {
    cleanupTimeoutLifecycle(lifecycle);
  }
}

// --- persist ---------------------------------------------------------------

/** Parses buffered text against the prompt's task order, then commits. */
export async function persistModuleLessonBatch(input: {
  readonly target: ModuleLessonGenerationTarget;
  readonly batch: ModuleLessonRawBatch;
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
    metadata: input.metadata,
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
  const timeoutConfig = resolveTimeoutConfig(params.timeoutConfig, clock);

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
    const provider = await resolveModuleLessonProvider(
      params,
      serverDbClient,
      deps.provider,
    );

    const batch = await generateModuleLessonRawBatch({
      target,
      batchInput,
      provider,
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
