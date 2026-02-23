import { isRetryableClassification } from '@/lib/ai/failures';
import {
  ATTEMPT_CAP,
  getPlanGenerationWindowStart,
  PLAN_GENERATION_LIMIT,
} from '@/lib/ai/generation-policy';
import {
  assertAttemptIdMatchesReservation,
  buildMetadata,
  computeRetryAfterSeconds,
  getPdfProvenance,
  isProviderErrorRetryable,
  logAttemptEvent,
  normalizeParsedModules,
  persistSuccessfulAttempt,
  sanitizeInput,
  selectUserGenerationAttemptWindowStats,
  toPromptHashPayload,
} from '@/lib/db/queries/helpers/attempts-helpers';
import { selectOwnedPlanById } from '@/lib/db/queries/helpers/plans-helpers';
import type {
  FinalizeFailureParams,
  FinalizeSuccessParams,
  GenerationAttemptRecord,
  ReserveAttemptResult,
  ReserveAttemptSlotParams,
} from '@/lib/db/queries/types/attempts.types';
import { generationAttempts, learningPlans } from '@/lib/db/schema';
import { logger } from '@/lib/logging/logger';
import {
  recordAttemptFailure,
  recordAttemptSuccess,
} from '@/lib/metrics/attempts';
import { db as serviceDb } from '@/lib/db/service-role';
import { hashSha256 } from '@/lib/utils/hash';
import { count, eq, sql } from 'drizzle-orm';

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
  const pdfProvenance = getPdfProvenance(input);
  const promptHash = hashSha256(
    JSON.stringify(toPromptHashPayload(planId, userId, input, sanitized))
  );

  const shouldNormalizeRlsContext = dbClient !== serviceDb;
  let requestJwtClaims: string | null = null;

  if (shouldNormalizeRlsContext) {
    // Capture existing claims from the current RLS session and re-apply them
    // inside the transaction. This avoids an extra users-table read here while
    // still defending against tx-scoped claim drift in some environments.
    const claimsRows = await dbClient.execute<{ claims: string | null }>(
      sql`SELECT current_setting('request.jwt.claims', true) AS claims`
    );
    const rawClaims = claimsRows[0]?.claims;
    if (typeof rawClaims === 'string' && rawClaims.length > 0) {
      requestJwtClaims = rawClaims;
    }
  }

  return dbClient.transaction(async (tx) => {
    const startedAt = nowFn();

    if (shouldNormalizeRlsContext && requestJwtClaims !== null) {
      await tx.execute(
        sql`SELECT set_config('request.jwt.claims', ${requestJwtClaims}, true)`
      );
    }

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

    if (existingAttempts >= ATTEMPT_CAP) {
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

    await tx
      .update(learningPlans)
      .set({
        generationStatus: 'generating',
        updatedAt: startedAt,
      })
      .where(eq(learningPlans.id, planId));

    return {
      reserved: true,
      attemptId: attempt.id,
      attemptNumber: existingAttempts + 1,
      startedAt,
      sanitized,
      promptHash,
      pdfProvenance,
    } as const;
  });
}

/**
 * Finalizes a previously reserved attempt as successful.
 * Updates the in-progress attempt row, replaces plan modules/tasks,
 * and records metrics — all within a single transaction.
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
    pdfProvenance: preparation.pdfProvenance ?? null,
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

  recordAttemptSuccess(updatedAttempt);

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
 * Updates the in-progress attempt row and plan status in one transaction, then records metrics.
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
    pdfProvenance: preparation.pdfProvenance ?? null,
    failure: { classification, timedOut },
  });

  const shouldNormalizeRlsContext = dbClient !== serviceDb;
  let requestJwtClaims: string | null = null;

  if (shouldNormalizeRlsContext) {
    const claimsRows = await dbClient.execute<{ claims: string | null }>(
      sql`SELECT current_setting('request.jwt.claims', true) AS claims`
    );
    const rawClaims = claimsRows[0]?.claims;
    if (typeof rawClaims === 'string' && rawClaims.length > 0) {
      requestJwtClaims = rawClaims;
    }
  }

  const attempt = await dbClient.transaction(async (tx) => {
    if (shouldNormalizeRlsContext && requestJwtClaims !== null) {
      await tx.execute(
        sql`SELECT set_config('request.jwt.claims', ${requestJwtClaims}, true)`
      );
    }

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
      .where(eq(generationAttempts.id, attemptId))
      .returning();

    if (!updatedAttempt) {
      throw new Error('Failed to finalize generation attempt as failure.');
    }

    const effectiveRetryable =
      classification === 'provider_error'
        ? isProviderErrorRetryable(error)
        : isRetryableClassification(classification);
    const isTerminal =
      !effectiveRetryable || preparation.attemptNumber >= ATTEMPT_CAP;

    if (isTerminal) {
      await tx
        .update(learningPlans)
        .set({
          generationStatus: 'failed',
          isQuotaEligible: false,
          updatedAt: finishedAt,
        })
        .where(eq(learningPlans.id, planId));
    } else {
      await tx
        .update(learningPlans)
        .set({
          generationStatus: 'pending_retry',
          updatedAt: finishedAt,
        })
        .where(eq(learningPlans.id, planId));
    }

    return updatedAttempt;
  });

  recordAttemptFailure(attempt);

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
