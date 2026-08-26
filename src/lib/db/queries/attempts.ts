import type {
  AttemptMetadata,
  FinalizeFailureParams,
  FinalizeSuccessParams,
  GenerationAttemptRecord,
  ReserveAttemptResult,
  ReserveAttemptSlotParams,
} from '@/lib/db/queries/types/attempts.types';
import type { DbTransaction } from '@/lib/db/types';

import { getAttemptCap } from '@/lib/config/env';
import { attemptMetadataWithAdmittedTier } from '@/lib/db/queries/helpers/attempt-admitted-tier';
import { logAttemptEvent } from '@/lib/db/queries/helpers/attempts-helpers';
import {
  buildMetadata,
  sanitizeInput,
  toPromptHashPayload,
} from '@/lib/db/queries/helpers/attempts-input';
import { normalizeParsedModules } from '@/lib/db/queries/helpers/attempts-persistence-normalization';
import {
  assertAttemptIdMatchesReservation,
  persistSuccessfulAttempt,
  whereInProgressGenerationAttemptForPlan,
} from '@/lib/db/queries/helpers/attempts-persistence-success';
import {
  computeRetryAfterSeconds,
  selectUserGenerationAttemptWindowStats,
} from '@/lib/db/queries/helpers/attempts-rate-limit';
import {
  countInProgressInitialAttemptsForUser,
  countPlansContributingToCap,
  lockUserPlanAdmission,
  planOwnsActiveCapSlot,
  selectUserEntitlementForAdmission,
  setLearningPlanGenerating,
} from '@/lib/db/queries/helpers/plan-generation-status';
import {
  hasActiveChildModuleGeneration,
  lockPlanLifecycle,
} from '@/lib/db/queries/helpers/plan-lifecycle-lock';
import { lockOwnedPlanById } from '@/lib/db/queries/helpers/plans-helpers';
import {
  prepareRlsTransactionContext,
  reapplyJwtClaimsInTransaction,
} from '@/lib/db/queries/helpers/rls-jwt-claims';
import { logger } from '@/lib/logging/logger';
import {
  getPlanGenerationWindowStart,
  PLAN_GENERATION_LIMIT,
} from '@/shared/constants/generation';
import { TIER_LIMITS } from '@/shared/constants/tier-limits';
import { evaluateFreeInitialAdmission } from '@/shared/policy/free-initial-admission';
import {
  describeGenerationPurpose,
  parseGenerationPurpose,
} from '@/shared/types/generation-purpose';
import { generationAttempts } from '@supabase/schema';
import { count, eq, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';

/**
 * Server-owned generation persistence: requires explicit dbClient (AttemptsDbClient)
 * in all params. Do not add default getDb() or make dbClient optional.
 *
 * Production callers pass serviceRoleDb from feature-owned generation boundaries
 * after request auth and ownership checks. JWT claim replay in transactions is a
 * no-op for service-role; it remains for any legacy RLS-scoped callers/tests.
 * See src/lib/db/AGENTS.md § "RLS-sensitive query modules".
 */

/**
 * Atomically reserves an attempt slot for a plan within a single transaction.
 *
 * 1. Acquires namespace-1 per-user admission lock, then namespace-3 plan lifecycle lock.
 * 2. Locks and re-reads the owned plan row.
 * 3. Rejects when an owned module is still `lessonGenerationStatus = 'generating'`.
 * 4. Enforces the active-plan cap when the target does not already own a slot.
 * 5. Enforces durable per-user window limit.
 * 6. Enforces per-plan attempt cap and rejects in-progress duplicates.
 * 7. Inserts a placeholder attempt with status 'in_progress'.
 * 8. Sets the plan's generation_status to 'generating' (durable cap reservation
 *    when the plan was ineligible).
 *
 * @returns AttemptReservation on success, AttemptRejection with reason on rejection.
 */
export async function reserveAttemptSlot(
  params: ReserveAttemptSlotParams,
): Promise<ReserveAttemptResult> {
  const {
    planId,
    userId,
    input,
    dbClient,
    allowedGenerationStatuses,
    requiredGenerationStatus,
  } = params;
  const generationPurpose = parseGenerationPurpose(params.generationPurpose);
  const nowFn = params.now ?? (() => new Date());

  const sanitized = sanitizeInput(input);
  const promptHash = createHash('sha256')
    .update(
      JSON.stringify(toPromptHashPayload(planId, userId, input, sanitized)),
    )
    .digest('hex');

  const rlsCtx = await prepareRlsTransactionContext(dbClient);

  return dbClient.transaction(async (tx) => {
    const startedAt = nowFn();
    await reapplyJwtClaimsInTransaction(tx, rlsCtx);

    await lockUserPlanAdmission(tx, userId);
    await lockPlanLifecycle(tx, planId);

    const plan = await lockOwnedPlanById({
      planId,
      ownerUserId: userId,
      dbClient: tx,
    });

    if (!plan) {
      throw new Error('Learning plan not found or inaccessible for user');
    }

    const statusAllowed =
      allowedGenerationStatuses !== undefined
        ? allowedGenerationStatuses.includes(plan.generationStatus)
        : requiredGenerationStatus === undefined
          ? true
          : plan.generationStatus === requiredGenerationStatus;
    if (!statusAllowed) {
      logger.debug(
        {
          planId,
          allowed: allowedGenerationStatuses ?? requiredGenerationStatus,
          actualStatus: plan.generationStatus,
        },
        'Plan reservation aborted: generation status mismatch',
      );
      return {
        reserved: false,
        reason: 'invalid_status',
        currentStatus: plan.generationStatus,
      } as const;
    }

    if (await hasActiveChildModuleGeneration(tx, planId)) {
      return { reserved: false, reason: 'active_child_generation' } as const;
    }

    const user = await selectUserEntitlementForAdmission(tx, userId);
    const freeAdmission = evaluateFreeInitialAdmission({
      tier: user.subscriptionTier,
      generationPurpose,
      initialPlanGeneratedAt: user.initialPlanGeneratedAt,
      inProgressInitialCount: await countInProgressInitialAttemptsForUser(tx, {
        userId,
        excludePlanId: planId,
      }),
    });
    if (freeAdmission === 'free_allowance_used') {
      return { reserved: false, reason: 'free_allowance_used' } as const;
    }
    if (freeAdmission === 'free_initial_in_progress') {
      return { reserved: false, reason: 'free_initial_in_progress' } as const;
    }

    if (!planOwnsActiveCapSlot(plan)) {
      const tierConfig = TIER_LIMITS[user.subscriptionTier];
      if (!tierConfig) {
        throw new Error(`Unknown subscription tier: ${user.subscriptionTier}`);
      }
      const limit = tierConfig.maxActivePlans;
      if (limit !== Infinity) {
        const currentCount = await countPlansContributingToCap(tx, userId);
        if (currentCount >= limit) {
          return { reserved: false, reason: 'plan_limit' } as const;
        }
      }
    }

    const windowStart = getPlanGenerationWindowStart(startedAt);

    const attemptWindowStats = await selectUserGenerationAttemptWindowStats({
      userId,
      dbClient: tx,
      since: windowStart,
    });
    const attemptsInWindow = attemptWindowStats.count;

    if (attemptsInWindow >= PLAN_GENERATION_LIMIT) {
      const retryAfter = computeRetryAfterSeconds(
        attemptWindowStats.oldestAttemptCreatedAt,
        startedAt,
      );

      return {
        reserved: false,
        reason: 'rate_limited',
        retryAfter,
      } as const;
    }

    const [attemptState] = await tx
      .select({
        existingAttempts: count(generationAttempts.id),
        inProgressAttempts:
          sql`count(*) filter (where ${generationAttempts.status} = 'in_progress')`.mapWith(
            Number,
          ),
      })
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, planId));

    const existingAttempts = Number(attemptState?.existingAttempts ?? 0);
    const inProgressAttempts = Number(attemptState?.inProgressAttempts ?? 0);

    if (existingAttempts >= getAttemptCap()) {
      return { reserved: false, reason: 'capped' } as const;
    }

    if (inProgressAttempts > 0) {
      return { reserved: false, reason: 'in_progress' } as const;
    }

    const [attempt] = await tx
      .insert(generationAttempts)
      .values({
        planId,
        status: 'in_progress',
        generationPurpose,
        classification: null,
        durationMs: 0,
        modulesCount: 0,
        tasksCount: 0,
        truncatedTopic: sanitized.topic.truncated,
        truncatedNotes: sanitized.notes.truncated ?? false,
        normalizedEffort: false,
        promptHash,
        metadata: attemptMetadataWithAdmittedTier(user.subscriptionTier),
      })
      .returning();

    if (!attempt) {
      throw new Error('Failed to reserve generation attempt slot.');
    }

    await setLearningPlanGenerating(tx, { planId, updatedAt: startedAt });

    return {
      reserved: true,
      attemptId: attempt.id,
      attemptNumber: existingAttempts + 1,
      startedAt,
      generationPurpose: attempt.generationPurpose,
      sanitized,
      promptHash,
    } as const;
  });
}

/**
 * Finalizes a previously reserved attempt as successful.
 * Updates the in-progress attempt row and replaces plan modules/tasks.
 */
export async function finalizeAttemptSuccess({
  attemptId,
  planId,
  preparation,
  modules: parsedModules,
  providerMetadata,
  durationMs,
  extendedTimeout,
  dbClient,
  now,
}: FinalizeSuccessParams): Promise<GenerationAttemptRecord> {
  assertAttemptIdMatchesReservation(attemptId, preparation);

  const nowFn = now ?? (() => new Date());

  const { normalizedModules, normalizationFlags } =
    normalizeParsedModules(parsedModules);

  const modulesCount = normalizedModules.length;
  const tasksCount = normalizedModules.reduce(
    (sum, module) => sum + module.tasks.length,
    0,
  );

  const finishedAt = nowFn();

  const metadata = buildMetadata({
    sanitized: preparation.sanitized,
    providerMetadata,
    modulesClamped: normalizationFlags.modulesClamped,
    tasksClamped: normalizationFlags.tasksClamped,
    startedAt: preparation.startedAt,
    finishedAt,
    extendedTimeout,
  });

  const updatedAttempt = await persistSuccessfulAttempt({
    attemptId,
    planId,
    preparation,
    normalizedModules,
    normalizationFlags,
    modulesCount,
    tasksCount,
    durationMs,
    metadata,
    finishedAt,
    dbClient,
  });

  logAttemptEvent('success', {
    planId,
    attemptId: updatedAttempt.id,
    generationPurpose: describeGenerationPurpose(preparation.generationPurpose),
    durationMs: updatedAttempt.durationMs,
    modulesCount,
    tasksCount,
  });

  return updatedAttempt;
}

export async function persistFailedAttemptInTx(
  tx: DbTransaction,
  params: {
    readonly attemptId: string;
    readonly planId: string;
    readonly classification: FinalizeFailureParams['classification'];
    readonly durationMs: number;
    readonly metadata: AttemptMetadata;
  },
): Promise<GenerationAttemptRecord> {
  const { attemptId, planId, classification, durationMs, metadata } = params;

  const [updatedAttempt] = await tx
    .update(generationAttempts)
    .set({
      status: 'failure',
      classification,
      durationMs: Math.max(0, Math.round(durationMs)),
      modulesCount: 0,
      tasksCount: 0,
      normalizedEffort: false,
      metadata,
    })
    .where(whereInProgressGenerationAttemptForPlan({ attemptId, planId }))
    .returning();

  if (!updatedAttempt) {
    throw new Error(
      `Failed to finalize generation attempt ${attemptId} for plan ${planId} as ${classification} failure.`,
    );
  }

  return updatedAttempt;
}

/**
 * Finalizes a previously reserved attempt as failed.
 * Updates only the in-progress attempt row.
 * Plan-level failure transitions are handled separately by lifecycle helpers
 * such as markPlanGenerationFailure() in features/plans/lifecycle/plan-persistence-store.ts.
 */
export async function finalizeAttemptFailure({
  attemptId,
  planId,
  preparation,
  classification,
  durationMs,
  timedOut = false,
  extendedTimeout = false,
  providerMetadata,
  dbClient,
  now,
}: FinalizeFailureParams): Promise<GenerationAttemptRecord> {
  assertAttemptIdMatchesReservation(attemptId, preparation);

  const nowFn = now ?? (() => new Date());
  const finishedAt = nowFn();

  const metadata = buildMetadata({
    sanitized: preparation.sanitized,
    providerMetadata,
    modulesClamped: false,
    tasksClamped: false,
    startedAt: preparation.startedAt,
    finishedAt,
    extendedTimeout,
    failure: { classification, timedOut },
  });

  const rlsCtx = await prepareRlsTransactionContext(dbClient);

  const attempt = await dbClient.transaction(async (tx) => {
    await reapplyJwtClaimsInTransaction(tx, rlsCtx);

    return persistFailedAttemptInTx(tx, {
      attemptId,
      planId,
      classification,
      durationMs,
      metadata,
    });
  });

  logAttemptEvent('failure', {
    planId,
    attemptId: attempt.id,
    generationPurpose: describeGenerationPurpose(preparation.generationPurpose),
    classification,
    durationMs: attempt.durationMs,
    timedOut,
    extendedTimeout,
  });

  return attempt;
}
