/**
 * Module lesson generation quota reservation boundary.
 *
 * Same reserve / work / compensate / reconcile lifecycle as regeneration,
 * keyed to `lessonGeneration` meter and `{ userId, planId, moduleId }` context.
 */

import type { DbClient } from '@/lib/db/types';
import { logger } from '@/lib/logging/logger';
import { recordBillingReconciliationRequired } from '@/lib/logging/ops-alerts';
import {
  compensateMeteredReservation,
  type MeteredReservationToken,
  type ReserveMeteredResult,
  reserveMeteredUsage,
} from './metered-reservation';

export type LessonGenerationQuotaWorkResult<TConsumed, TReverted = TConsumed> =
  | { disposition: 'consumed'; value: TConsumed }
  | {
      disposition: 'revert';
      value: TReverted;
      reason?: string;
    };

type LessonGenerationQuotaResult<TConsumed, TReverted = TConsumed> =
  | { ok: true; consumed: true; value: TConsumed }
  | {
      ok: true;
      consumed: false;
      value: TReverted;
      reconciliationRequired: boolean;
    }
  | { ok: false; currentCount: number; limit: number };

type LessonGenerationQuotaBoundaryArgs<TConsumed, TReverted = TConsumed> = {
  userId: string;
  planId: string;
  moduleId: string;
  dbClient: DbClient;
  work: () => Promise<LessonGenerationQuotaWorkResult<TConsumed, TReverted>>;
};

type ReconciliationContext = {
  planId: string;
  moduleId: string;
  userId: string;
};

type CompensationLogContext = {
  planId: string;
  moduleId: string;
  userId: string;
  reason: string;
};

export type LessonGenerationQuotaBoundaryDeps = {
  reserve: (
    userId: string,
    dbClient: DbClient,
  ) => Promise<ReserveMeteredResult>;
  compensate: (
    token: MeteredReservationToken,
    dbClient: DbClient,
  ) => Promise<void>;
  reportReconciliation: (
    context: ReconciliationContext,
    error: unknown,
  ) => void;
};

type SafeCompensateArgs = {
  deps: LessonGenerationQuotaBoundaryDeps;
  token: MeteredReservationToken;
  dbClient: DbClient;
  reconciliationContext: ReconciliationContext;
  logContext: CompensationLogContext;
};

const DEFAULT_DEPS: LessonGenerationQuotaBoundaryDeps = {
  reserve: (userId, dbClient) =>
    reserveMeteredUsage({ userId, meter: 'lessonGeneration' }, dbClient),
  compensate: (token, dbClient) =>
    compensateMeteredReservation(token, dbClient),
  reportReconciliation: recordBillingReconciliationRequired,
};

export async function runLessonGenerationQuotaReserved<
  TConsumed,
  TReverted = TConsumed,
>(
  args: LessonGenerationQuotaBoundaryArgs<TConsumed, TReverted>,
  deps: LessonGenerationQuotaBoundaryDeps = DEFAULT_DEPS,
): Promise<LessonGenerationQuotaResult<TConsumed, TReverted>> {
  const { userId, planId, moduleId, dbClient, work } = args;

  const reservation = await deps.reserve(userId, dbClient);
  if (!reservation.ok) {
    return {
      ok: false,
      currentCount: reservation.currentCount,
      limit: reservation.limit,
    };
  }

  const { token } = reservation;

  let workResult: LessonGenerationQuotaWorkResult<TConsumed, TReverted>;
  try {
    workResult = await work();
  } catch (workError) {
    await safelyCompensate({
      deps,
      token,
      dbClient,
      reconciliationContext: { planId, moduleId, userId },
      logContext: { planId, moduleId, userId, reason: 'work_threw' },
    });
    throw workError;
  }

  if (workResult.disposition === 'consumed') {
    return { ok: true, consumed: true, value: workResult.value };
  }

  const reconciliationRequired = await safelyCompensate({
    deps,
    token,
    dbClient,
    reconciliationContext: {
      planId,
      moduleId,
      userId,
    },
    logContext: {
      planId,
      moduleId,
      userId,
      reason: workResult.reason ?? 'work_revert',
    },
  });

  return {
    ok: true,
    consumed: false,
    value: workResult.value,
    reconciliationRequired,
  };
}

async function safelyCompensate(args: SafeCompensateArgs): Promise<boolean> {
  try {
    await args.deps.compensate(args.token, args.dbClient);
    return false;
  } catch (compensateError) {
    try {
      args.deps.reportReconciliation(
        args.reconciliationContext,
        compensateError,
      );
    } catch (reportError) {
      logger.error(
        { ...args.logContext, reportError },
        'Failed to report billing reconciliation alert',
      );
    }
    logger.error(
      {
        ...args.logContext,
        compensateError,
      },
      'Failed to compensate lesson generation usage reservation',
    );
    return true;
  }
}
