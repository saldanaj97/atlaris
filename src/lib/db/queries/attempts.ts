import { and, count, eq, sql } from 'drizzle-orm';
import { getAttemptCap } from '@/lib/config/env';
import { hashSha256 } from '@/lib/crypto/hash';
import {
  isProviderErrorRetryable,
  logAttemptEvent,
} from '@/lib/db/queries/helpers/attempts-helpers';
import {
  buildMetadata,
  sanitizeInput,
  toPromptHashPayload,
} from '@/lib/db/queries/helpers/attempts-input';
import {
  assertAttemptIdMatchesReservation,
  normalizeParsedModules,
  persistSuccessfulAttempt,
} from '@/lib/db/queries/helpers/attempts-persistence';
import {
  computeRetryAfterSeconds,
  selectUserGenerationAttemptWindowStats,
} from '@/lib/db/queries/helpers/attempts-rate-limit';
import { setLearningPlanGenerating } from '@/lib/db/queries/helpers/plan-generation-status';
import { selectOwnedPlanById } from '@/lib/db/queries/helpers/plans-helpers';
import {
  prepareRlsTransactionContext,
  reapplyJwtClaimsInTransaction,
} from '@/lib/db/queries/helpers/rls-jwt-claims';
import type {
  FinalizeFailureParams,
  FinalizeSuccessParams,
  GenerationAttemptRecord,
  ReserveAttemptResult,
  ReserveAttemptSlotParams,
} from '@/lib/db/queries/types/attempts.types';
import { generationAttempts } from '@/lib/db/schema';
import { logger } from '@/lib/logging/logger';
import {
  getPlanGenerationWindowStart,
  PLAN_GENERATION_LIMIT,
} from '@/shared/constants/generation';
import { isRetryableClassification } from '@/shared/types/failure-classification';

/**
 * RLS-sensitive query module: approved exception to the default "optional dbClient = getDb()" pattern.
 * This file requires explicit dbClient (AttemptsDbClient) in all params;
 * do not add default getDb() or make dbClient optional — callers must pass request-scoped getDb()
 * so RLS claims are preserved. See src/lib/db/AGENTS.md § "RLS-sensitive query modules".
 */

/**
 * Atomically reserves an attempt slot for a plan within a single transaction.
 *
 * 1. Acquires a transaction-scoped advisory lock per user to serialize concurrent reservations.
 * 2. Reads the owned plan row and verifies ownership.
 * 3. Enforces durable per-user window limit.
 * 4. Enforces per-plan attempt cap and rejects in-progress duplicates.
 * 5. Inserts a placeholder attempt with status 'in_progress'.
 * 6. Sets the plan's generation_status to 'generating'.
 *
 * @returns AttemptReservation on success, AttemptRejection with reason on rejection.
 */
export async function reserveAttemptSlot(
  params: ReserveAttemptSlotParams
): Promise<ReserveAttemptResult> {
  const {
    planId,
    userId,
    input,
    dbClient,
    allowedGenerationStatuses,
    requiredGenerationStatus,
  } = params;
  const nowFn = params.now ?? (() => new Date());

  const sanitized = sanitizeInput(input);
  const promptHash = hashSha256(
    JSON.stringify(toPromptHashPayload(planId, userId, input, sanitized))
  );

  const rlsCtx = await prepareRlsTransactionContext(dbClient);

  return dbClient.transaction(async (tx) => {
    const startedAt = nowFn();
    await reapplyJwtClaimsInTransaction(tx, rlsCtx);

    // Acquire per-user advisory lock to serialize concurrent reservations.
    // Uses the two-int4 overload so namespace 1 is separated from the
    // per-user key, avoiding cross-domain collisions that the single-bigint
    // form (hashtext → bigint) would allow with only 32-bit entropy.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(1, hashtext(${userId}))`);

    const plan = await selectOwnedPlanById({
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
        'Plan reservation aborted: generation status mismatch'
      );
      return {
        reserved: false,
        reason: 'invalid_status',
        currentStatus: plan.generationStatus,
      } as const;
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
        startedAt
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
            Number
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
        classification: null,
        durationMs: 0,
        modulesCount: 0,
        tasksCount: 0,
        truncatedTopic: sanitized.topic.truncated,
        truncatedNotes: sanitized.notes.truncated ?? false,
        normalizedEffort: false,
        promptHash,
        metadata: null,
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
    0
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
    durationMs: updatedAttempt.durationMs,
    modulesCount,
    tasksCount,
  });

  return updatedAttempt;
}

/**
 * Finalizes a previously reserved attempt as failed.
 * Updates only the in-progress attempt row.
 * Plan-level failure transitions are handled separately by lifecycle helpers
 * such as markPlanGenerationFailure() in features/plans/lifecycle/adapters/plan-persistence-store.ts.
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
  error,
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
      .where(
        and(
          eq(generationAttempts.id, attemptId),
          eq(generationAttempts.planId, planId),
          eq(generationAttempts.status, 'in_progress')
        )
      )
      .returning();

    if (!updatedAttempt) {
      throw new Error('Failed to finalize generation attempt as failure.');
    }

    void (classification === 'provider_error'
      ? isProviderErrorRetryable(error)
      : isRetryableClassification(classification));
    void preparation.attemptNumber;
    void finishedAt;

    return updatedAttempt;
  });

  logAttemptEvent('failure', {
    planId,
    attemptId: attempt.id,
    classification,
    durationMs: attempt.durationMs,
    timedOut,
    extendedTimeout,
  });

  return attempt;
}
