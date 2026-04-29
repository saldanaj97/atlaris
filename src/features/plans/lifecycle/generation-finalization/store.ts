import {
  getCurrentMonth,
  incrementUsageInTx,
} from '@/features/billing/usage-metrics';
import {
  markPlanGenerationFailureInTx,
  markPlanGenerationSuccessInTx,
} from '@/features/plans/lifecycle/adapters/plan-persistence-store';
import { persistFailedAttemptInTx } from '@/lib/db/queries/attempts';
import {
  isProviderErrorRetryable,
  logAttemptEvent,
} from '@/lib/db/queries/helpers/attempts-helpers';
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
import { canonicalUsageToRecordParams, recordUsageInTx } from '@/lib/db/usage';
import { isRetryableClassification } from '@/shared/types/failure-classification';

import type {
  AttemptsDbClient,
  GenerationAttemptRecord,
} from '@/lib/db/queries/types/attempts.types';
import type { ProviderMetadata } from '@/shared/types/ai-provider.types';
import type {
  FinalizeGenerationFailureParams,
  FinalizeGenerationSuccessInput,
  GenerationFinalizationStoreDeps,
} from './types';

function asProviderMetadata(value: Record<string, unknown>): ProviderMetadata {
  return value as ProviderMetadata;
}

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
    providerMetadata: asProviderMetadata(input.providerMetadata),
    modulesClamped: normalizationFlags.modulesClamped,
    tasksClamped: normalizationFlags.tasksClamped,
    startedAt: input.preparation.startedAt,
    finishedAt,
    extendedTimeout: input.extendedTimeout,
  });

  const rlsCtx = await prepareRlsTransactionContext(dbClient);
  const usageMonth = getCurrentMonth(finishedAt);
  const incrementKind = input.usageKind === 'plan' ? 'plan' : 'regeneration';

  const attempt = await dbClient.transaction(async (tx) => {
    await reapplyJwtClaimsInTransaction(tx, rlsCtx);

    const persisted = await persistSuccessfulAttemptInTx(tx, {
      attemptId: input.attemptId,
      planId: input.planId,
      preparation: input.preparation,
      normalizedModules,
      normalizationFlags,
      modulesCount,
      tasksCount,
      durationMs: input.durationMs,
      metadata,
      finishedAt,
    });

    await deps.afterSuccessfulAttemptPersist?.();

    await markPlanGenerationSuccessInTx(tx, input.planId, finishedAt);

    await recordUsageInTx(
      tx,
      canonicalUsageToRecordParams(input.usage, input.userId),
    );
    await incrementUsageInTx(tx, input.userId, usageMonth, incrementKind);

    return persisted;
  });

  logAttemptEvent('success', {
    planId: input.planId,
    attemptId: attempt.id,
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
      if (!input.retryable && input.usage) {
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

    void (input.classification === 'provider_error'
      ? isProviderErrorRetryable(input.error)
      : isRetryableClassification(input.classification));
    void input.preparation.attemptNumber;

    await markPlanGenerationFailureInTx(tx, input.planId, finishedAt);

    if (!input.retryable && input.usage) {
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
    classification: input.classification,
    durationMs: attempt.durationMs,
    timedOut: input.timedOut,
    extendedTimeout: input.extendedTimeout,
  });

  return attempt;
}
