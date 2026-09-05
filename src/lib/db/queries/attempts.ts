import type {
  AttemptReservation,
  AttemptMetadata,
  AttemptsDbClient,
  GenerationAttemptRecord,
  ReserveAttemptResult,
  ReserveAttemptSlotParams,
} from '@/lib/db/queries/types/attempts.types';
import type { DbTransaction } from '@/lib/db/types';
import type { GenerationInput } from '@/shared/types/ai-provider.types';
import type { FailureClassification } from '@/shared/types/failure-classification.types';
import type { GenerationPurpose } from '@/shared/types/generation-purpose';

import { getAttemptCap } from '@/lib/config/env';
import {
  attemptMetadataWithAdmittedTier,
  readAdmittedTierFromAttemptMetadata,
} from '@/lib/db/queries/helpers/attempt-admitted-tier';
import {
  sanitizeInput,
  toPromptHashPayload,
} from '@/lib/db/queries/helpers/attempts-input';
import { whereInProgressGenerationAttemptForPlan } from '@/lib/db/queries/helpers/attempts-persistence-success';
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
import { parseGenerationPurpose } from '@/shared/types/generation-purpose';
import { generationAttempts } from '@supabase/schema';
import { asc, count, eq, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';

function readWorkflowIdempotencyKey(metadata: unknown): string | null {
  if (metadata == null || typeof metadata !== 'object') {
    return null;
  }

  const workflow = (metadata as Record<string, unknown>).workflow;
  if (workflow == null || typeof workflow !== 'object') {
    return null;
  }

  const key = (workflow as Record<string, unknown>).idempotencyKey;
  return typeof key === 'string' && key.length > 0 ? key : null;
}

function buildAttemptPreparation(
  planId: string,
  userId: string,
  input: GenerationInput,
): Pick<AttemptReservation, 'sanitized' | 'promptHash'> {
  const sanitized = sanitizeInput(input);
  const promptHash = createHash('sha256')
    .update(
      JSON.stringify(toPromptHashPayload(planId, userId, input, sanitized)),
    )
    .digest('hex');

  return { sanitized, promptHash };
}

type RecoveredAttemptReservation = AttemptReservation &
  Pick<GenerationAttemptRecord, 'status'>;

/**
 * Reads the durable tier admitted for a workflow reservation, when a reserve
 * step is replayed before it can persist its step result.
 */
export async function findAttemptWithWorkflowIdempotencyKey(params: {
  planId: string;
  userId: string;
  input: GenerationInput;
  generationPurpose: GenerationPurpose;
  workflowIdempotencyKey: string;
  dbClient: AttemptsDbClient;
}): Promise<RecoveredAttemptReservation | null> {
  const { sanitized, promptHash } = buildAttemptPreparation(
    params.planId,
    params.userId,
    params.input,
  );
  const attempts = await params.dbClient
    .select({
      id: generationAttempts.id,
      status: generationAttempts.status,
      generationPurpose: generationAttempts.generationPurpose,
      promptHash: generationAttempts.promptHash,
      metadata: generationAttempts.metadata,
      createdAt: generationAttempts.createdAt,
    })
    .from(generationAttempts)
    .where(eq(generationAttempts.planId, params.planId))
    .orderBy(asc(generationAttempts.createdAt));

  const matchingAttemptIndex = attempts.findIndex(
    (attempt) =>
      readWorkflowIdempotencyKey(attempt.metadata) ===
      params.workflowIdempotencyKey,
  );
  const matchingAttempt =
    matchingAttemptIndex >= 0 ? attempts[matchingAttemptIndex] : undefined;
  if (!matchingAttempt) {
    return null;
  }

  if (
    matchingAttempt.generationPurpose !== params.generationPurpose ||
    matchingAttempt.promptHash !== promptHash
  ) {
    throw new Error(
      `Generation reservation idempotency key ${params.workflowIdempotencyKey} was already used with different generation input.`,
    );
  }

  const admittedTier = readAdmittedTierFromAttemptMetadata(
    matchingAttempt.metadata,
  );
  return {
    reserved: true,
    attemptId: matchingAttempt.id,
    attemptNumber: matchingAttemptIndex + 1,
    startedAt: matchingAttempt.createdAt,
    ...(admittedTier ? { admittedTier } : {}),
    generationPurpose: matchingAttempt.generationPurpose,
    sanitized,
    promptHash: matchingAttempt.promptHash,
    status: matchingAttempt.status,
  };
}

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

  const { sanitized, promptHash } = buildAttemptPreparation(
    planId,
    userId,
    input,
  );

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

    const idempotencyKey = params.workflowMetadata?.idempotencyKey;
    if (idempotencyKey) {
      const attempts = await tx
        .select({
          id: generationAttempts.id,
          status: generationAttempts.status,
          generationPurpose: generationAttempts.generationPurpose,
          promptHash: generationAttempts.promptHash,
          metadata: generationAttempts.metadata,
          createdAt: generationAttempts.createdAt,
        })
        .from(generationAttempts)
        .where(eq(generationAttempts.planId, planId))
        .orderBy(generationAttempts.createdAt);
      const matchingAttemptIndex = attempts.findIndex(
        (attempt) =>
          readWorkflowIdempotencyKey(attempt.metadata) === idempotencyKey,
      );
      const matchingAttempt =
        matchingAttemptIndex >= 0 ? attempts[matchingAttemptIndex] : undefined;

      if (matchingAttempt) {
        if (
          matchingAttempt.generationPurpose !== generationPurpose ||
          matchingAttempt.promptHash !== promptHash
        ) {
          throw new Error(
            `Generation reservation idempotency key ${idempotencyKey} was already used with different generation input.`,
          );
        }

        const admittedTier = readAdmittedTierFromAttemptMetadata(
          matchingAttempt.metadata,
        );

        return {
          reserved: true,
          attemptId: matchingAttempt.id,
          attemptNumber: matchingAttemptIndex + 1,
          startedAt: matchingAttempt.createdAt,
          ...(admittedTier ? { admittedTier } : {}),
          generationPurpose: matchingAttempt.generationPurpose,
          sanitized,
          promptHash: matchingAttempt.promptHash,
        } as const;
      }
    }

    if (await hasActiveChildModuleGeneration(tx, planId)) {
      return { reserved: false, reason: 'active_child_generation' } as const;
    }

    const user = await selectUserEntitlementForAdmission(tx, userId);
    const freeAdmission = evaluateFreeInitialAdmission({
      tier: user.subscriptionTier,
      generationPurpose,
      initialPlanGeneratedAt: user.initialPlanGeneratedAt,
      inProgressInitialCount:
        user.subscriptionTier === 'free' && generationPurpose === 'initial'
          ? await countInProgressInitialAttemptsForUser(tx, {
              userId,
              excludePlanId: planId,
            })
          : 0,
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
        metadata: {
          ...attemptMetadataWithAdmittedTier(user.subscriptionTier),
          ...(params.workflowMetadata
            ? { workflow: params.workflowMetadata }
            : {}),
        },
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
      ...(idempotencyKey ? { admittedTier: user.subscriptionTier } : {}),
      generationPurpose: attempt.generationPurpose,
      sanitized,
      promptHash,
    } as const;
  });
}

export async function persistFailedAttemptInTx(
  tx: DbTransaction,
  params: {
    readonly attemptId: string;
    readonly planId: string;
    readonly classification: FailureClassification;
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
