import type { DbClient } from '@/lib/db/types';

import {
  compensateMeteredReservation,
  type MeteredReservationToken,
  type ReserveMeteredResult,
  reserveMeteredUsage,
} from './metered-reservation';
import { logger } from '@/lib/logging/logger';
import { recordBillingReconciliationRequired } from '@/lib/logging/ops-alerts';
import { db as serviceRoleDb } from '@supabase/service-role';

export type MeteredQuotaWorkResult<TConsumed, TReverted = TConsumed> =
  | { disposition: 'consumed'; value: TConsumed }
  | {
      disposition: 'revert';
      value: TReverted;
      reason?: string;
    };

type MeteredQuotaResult<TConsumed, TReverted> =
  | { ok: true; consumed: true; value: TConsumed }
  | {
      ok: true;
      consumed: false;
      value: TReverted;
      reconciliationRequired: boolean;
    }
  | { ok: false; currentCount: number; limit: number };

type BillingReconciliationContext = {
  planId: string;
  userId: string;
  jobId?: string;
  moduleId?: string;
};

export type MeteredQuotaBoundaryDeps = {
  reserve: (
    userId: string,
    dbClient: DbClient,
  ) => Promise<ReserveMeteredResult>;
  compensate: (
    token: MeteredReservationToken,
    dbClient: DbClient,
  ) => Promise<void>;
  reportReconciliation: (
    context: BillingReconciliationContext,
    error: unknown,
  ) => void;
};

type SafeCompensateArgs = {
  deps: MeteredQuotaBoundaryDeps;
  token: MeteredReservationToken;
  dbClient: DbClient;
  reconciliationContext: BillingReconciliationContext;
  logContext: Record<string, unknown>;
  compensationFailureMessage: string;
};

type RunMeteredQuotaReservedArgs<
  TConsumed,
  TReverted,
  TWorkResult extends MeteredQuotaWorkResult<TConsumed, TReverted>,
> = {
  userId: string;
  dbClient: DbClient;
  work: () => Promise<TWorkResult>;
  buildWorkThrowContexts: () => {
    reconciliationContext: BillingReconciliationContext;
    logContext: Record<string, unknown>;
  };
  buildRevertContexts: (
    workResult: Extract<TWorkResult, { disposition: 'revert' }>,
  ) => {
    reconciliationContext: BillingReconciliationContext;
    logContext: Record<string, unknown>;
  };
  compensationFailureMessage: string;
};

export function createServiceRoleMeteredBoundaryDeps<
  TMeter extends 'lessonGeneration' | 'regeneration',
>(meter: TMeter): MeteredQuotaBoundaryDeps {
  return {
    reserve: (userId, dbClient) =>
      reserveMeteredUsage(
        { userId, meter },
        dbClient === serviceRoleDb ? dbClient : serviceRoleDb,
      ),
    compensate: (token, dbClient) =>
      compensateMeteredReservation(
        token,
        dbClient === serviceRoleDb ? dbClient : serviceRoleDb,
      ),
    reportReconciliation: recordBillingReconciliationRequired,
  };
}

export async function runMeteredQuotaReserved<
  TConsumed,
  TReverted,
  TWorkResult extends MeteredQuotaWorkResult<TConsumed, TReverted>,
>(
  args: RunMeteredQuotaReservedArgs<TConsumed, TReverted, TWorkResult>,
  deps: MeteredQuotaBoundaryDeps,
): Promise<MeteredQuotaResult<TConsumed, TReverted>> {
  const {
    userId,
    dbClient,
    work,
    buildWorkThrowContexts,
    buildRevertContexts,
    compensationFailureMessage,
  } = args;

  const reservation = await deps.reserve(userId, dbClient);
  if (!reservation.ok) {
    return {
      ok: false,
      currentCount: reservation.currentCount,
      limit: reservation.limit,
    };
  }

  const { token } = reservation;

  let workResult: TWorkResult;
  try {
    workResult = await work();
  } catch (workError) {
    const { reconciliationContext, logContext } = buildWorkThrowContexts();
    await safelyCompensate({
      deps,
      token,
      dbClient,
      reconciliationContext,
      logContext,
      compensationFailureMessage,
    });
    throw workError;
  }

  if (workResult.disposition === 'consumed') {
    return { ok: true, consumed: true, value: workResult.value };
  }

  const revertResult = workResult as Extract<
    TWorkResult,
    { disposition: 'revert' }
  >;
  const { reconciliationContext, logContext } =
    buildRevertContexts(revertResult);

  const reconciliationRequired = await safelyCompensate({
    deps,
    token,
    dbClient,
    reconciliationContext,
    logContext,
    compensationFailureMessage,
  });

  return {
    ok: true,
    consumed: false,
    value: revertResult.value as TReverted,
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
      args.compensationFailureMessage,
    );
    return true;
  }
}
