import type {
  FinalizeGenerationFailureParams,
  FinalizeGenerationSuccessInput,
  GenerationFinalizationStoreDeps,
} from './types';
import type {
  AttemptsDbClient,
  GenerationAttemptRecord,
} from '@/lib/db/queries/types/attempts.types';

import {
  canonicalUsageToRecordParams,
  recordUsageInTx,
} from '../../../../../supabase/usage';
import {
  getCurrentMonth,
  incrementUsageInTx,
} from '@/features/billing/usage-metrics';
import {
  markPlanGenerationFailureInTx,
  markPlanGenerationSuccessInTx,
} from '@/features/plans/lifecycle/plan-persistence-store';
import { isFreeAdmittedTier } from '@/features/plans/policy/entitlement';
import { persistFailedAttemptInTx } from '@/lib/db/queries/attempts';
import { readAdmittedTierFromAttemptMetadata } from '@/lib/db/queries/helpers/attempt-admitted-tier';
import { logAttemptEvent } from '@/lib/db/queries/helpers/attempts-helpers';
import { buildMetadata } from '@/lib/db/queries/helpers/attempts-input';
import { normalizeParsedModules } from '@/lib/db/queries/helpers/attempts-persistence-normalization';
import {
  assertAttemptIdMatchesReservation,
  persistSuccessfulAttemptInTx,
} from '@/lib/db/queries/helpers/attempts-persistence-success';
import {
  prepareRlsTransactionContext,
  reapplyJwtClaimsInTransaction,
} from '@/lib/db/queries/helpers/rls-jwt-claims';
import { describeGenerationPurpose } from '@/shared/types/generation-purpose';
import { generationAttempts, users } from '@supabase/schema';
import { and, eq, isNull } from 'drizzle-orm';

export async function commitPlanGenerationSuccess(
  dbClient: AttemptsDbClient,
  input: FinalizeGenerationSuccessInput,
  deps: GenerationFinalizationStoreDeps = {},
): Promise<GenerationAttemptRecord> {
  assertAttemptIdMatchesReservation(input.attemptId, input.preparation);

  const nowFn = input.now ?? (() => new Date());
  const finishedAt = nowFn();

  const { normalizedModules, normalizationFlags } = normalizeParsedModules([
    ...input.modules,
  ]);
  const modulesCount = normalizedModules.length;
  const tasksCount = normalizedModules.reduce(
    (sum, module) => sum + module.tasks.length,
    0,
  );

  const metadata = buildMetadata({
    sanitized: input.preparation.sanitized,
    providerMetadata: input.providerMetadata,
    workflowMetadata: input.workflowMetadata,
    modulesClamped: normalizationFlags.modulesClamped,
    tasksClamped: normalizationFlags.tasksClamped,
    startedAt: input.preparation.startedAt,
    finishedAt,
    extendedTimeout: input.extendedTimeout,
  });

  const rlsCtx = await prepareRlsTransactionContext(dbClient);
  const usageMonth = getCurrentMonth(finishedAt);
  const isInitialSuccess = input.generationPurpose === 'initial';

  const attempt = await dbClient.transaction(async (tx) => {
    await reapplyJwtClaimsInTransaction(tx, rlsCtx);

    const [inProgressAttempt] = await tx
      .select({ metadata: generationAttempts.metadata })
      .from(generationAttempts)
      .where(eq(generationAttempts.id, input.attemptId))
      .limit(1);
    const admittedTier = readAdmittedTierFromAttemptMetadata(
      inProgressAttempt?.metadata,
    );

    const persisted = await persistSuccessfulAttemptInTx(tx, {
      attemptId: input.attemptId,
      planId: input.planId,
      preparation: input.preparation,
      normalizedModules,
      normalizationFlags,
      modulesCount,
      tasksCount,
      durationMs: input.durationMs,
      metadata: {
        ...metadata,
        ...(admittedTier ? { admitted_tier: admittedTier } : {}),
      },
      finishedAt,
    });

    await deps.afterSuccessfulAttemptPersist?.();

    await markPlanGenerationSuccessInTx(tx, input.planId, finishedAt);

    await recordUsageInTx(
      tx,
      canonicalUsageToRecordParams(input.usage, input.userId),
    );
    if (isInitialSuccess) {
      await incrementUsageInTx(tx, input.userId, usageMonth, 'plan');
      await tx
        .update(users)
        .set({ initialPlanGeneratedAt: finishedAt })
        .where(
          and(eq(users.id, input.userId), isNull(users.initialPlanGeneratedAt)),
        );
      if (isFreeAdmittedTier(admittedTier)) {
        await tx
          .update(users)
          .set({
            freeAccessPlanId: input.planId,
            freeAccessPlanSelectedAt: finishedAt,
          })
          .where(
            and(
              eq(users.id, input.userId),
              isNull(users.freeAccessPlanSelectedAt),
            ),
          );
      }
    }

    return persisted;
  });

  logAttemptEvent('success', {
    planId: input.planId,
    attemptId: attempt.id,
    generationPurpose: describeGenerationPurpose(input.generationPurpose),
    durationMs: attempt.durationMs,
    modulesCount,
    tasksCount,
  });

  return attempt;
}

export async function commitPlanGenerationFailure(
  dbClient: AttemptsDbClient,
  input: FinalizeGenerationFailureParams,
): Promise<GenerationAttemptRecord | void> {
  const nowFn = input.now ?? (() => new Date());
  const finishedAt = nowFn();
  const usageMonth = getCurrentMonth(finishedAt);
  const rlsCtx = await prepareRlsTransactionContext(dbClient);

  if (input.variant === 'plan_only') {
    await dbClient.transaction(async (tx) => {
      await reapplyJwtClaimsInTransaction(tx, rlsCtx);
      await markPlanGenerationFailureInTx(tx, input.planId, finishedAt);
      if (
        !input.retryable &&
        input.usage &&
        input.generationPurpose === 'initial'
      ) {
        await recordUsageInTx(
          tx,
          canonicalUsageToRecordParams(input.usage, input.userId),
        );
        await incrementUsageInTx(tx, input.userId, usageMonth, 'plan');
      }
    });
    return;
  }

  assertAttemptIdMatchesReservation(input.attemptId, input.preparation);

  const metadata = buildMetadata({
    sanitized: input.preparation.sanitized,
    providerMetadata: input.providerMetadata,
    workflowMetadata: input.workflowMetadata,
    modulesClamped: false,
    tasksClamped: false,
    startedAt: input.preparation.startedAt,
    finishedAt,
    extendedTimeout: input.extendedTimeout,
    failure: { classification: input.classification, timedOut: input.timedOut },
  });

  const attempt = await dbClient.transaction(async (tx) => {
    await reapplyJwtClaimsInTransaction(tx, rlsCtx);

    const updated = await persistFailedAttemptInTx(tx, {
      attemptId: input.attemptId,
      planId: input.planId,
      classification: input.classification,
      durationMs: input.durationMs,
      metadata,
    });

    await markPlanGenerationFailureInTx(tx, input.planId, finishedAt);

    if (
      !input.retryable &&
      input.usage &&
      input.generationPurpose === 'initial'
    ) {
      await recordUsageInTx(
        tx,
        canonicalUsageToRecordParams(input.usage, input.userId),
      );
      await incrementUsageInTx(tx, input.userId, usageMonth, 'plan');
    }

    return updated;
  });

  logAttemptEvent('failure', {
    planId: input.planId,
    attemptId: attempt.id,
    generationPurpose: describeGenerationPurpose(input.generationPurpose),
    classification: input.classification,
    durationMs: attempt.durationMs,
    timedOut: input.timedOut,
    extendedTimeout: input.extendedTimeout,
  });

  return attempt;
}
