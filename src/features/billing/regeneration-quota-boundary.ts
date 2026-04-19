/**
 * Regeneration-focused quota reservation boundary.
 *
 * Owns the reserve / run-work / compensate / reconcile lifecycle for the
 * regeneration HTTP path so route handlers do not have to thread together
 * billing primitives, queue dedupe, and Sentry telemetry.
 *
 * Phase-1 scope is intentionally regeneration-only; PDF, exports, and any
 * other meter continue to flow through their existing wrappers until they
 * are migrated onto the same private metered-reservation core.
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

/**
 * Outcome the caller's `work()` function returns to describe what should
 * happen to the reservation that the boundary just took out.
 *
 * @property disposition - `'consumed'` keeps the reservation; `'revert'` triggers compensation in the same month bucket.
 * @property value - Forwarded back to the caller in the success result.
 * @property reason - Free-form revert tag for telemetry (e.g. `'enqueue_deduplicated'`).
 * @property jobId - Job id correlated with the revert, when one exists.
 */
export type RegenerationQuotaWorkResult<T> =
  | { disposition: 'consumed'; value: T }
  | {
      disposition: 'revert';
      value: T;
      reason?: string;
      jobId?: string;
    };

/**
 * Result returned to the route after the boundary settles.
 *
 * - `ok: false` means quota was denied at reserve time; route should map to 429.
 * - `ok: true, consumed: true` means the reservation stuck and the route should accept the request.
 * - `ok: true, consumed: false` means the reservation was reverted; route should map to 409 (or its caller-defined conflict). `reconciliationRequired` is true when the compensation step itself failed.
 */
export type RegenerationQuotaResult<T> =
  | { ok: true; consumed: true; value: T }
  | {
      ok: true;
      consumed: false;
      value: T;
      reconciliationRequired: boolean;
    }
  | { ok: false; currentCount: number; limit: number };

export type RegenerationQuotaBoundaryArgs<T> = {
  userId: string;
  planId: string;
  dbClient: DbClient;
  work: () => Promise<RegenerationQuotaWorkResult<T>>;
};

/**
 * Context used by both reconciliation telemetry and the structured log line
 * emitted when compensation fails. Kept explicit so test fakes and call sites
 * stay type-checked instead of accepting any string-keyed bag.
 */
type ReconciliationContext = {
  planId: string;
  userId: string;
  jobId?: string;
};

type CompensationLogContext = {
  planId: string;
  userId: string;
  reason: string;
  jobId?: string;
};

/**
 * Injectable seam for unit tests. Defaults wire production billing primitives
 * and Sentry telemetry; callers should not pass overrides outside tests.
 *
 * `reportReconciliation` accepts `unknown` because the failure originates from
 * a `catch` clause where TypeScript surfaces caught values as `unknown`. The
 * default implementation normalizes to `Error` before forwarding to Sentry.
 */
export type RegenerationQuotaBoundaryDeps = {
  reserve: (
    userId: string,
    dbClient: DbClient
  ) => Promise<ReserveMeteredResult>;
  compensate: (
    token: MeteredReservationToken,
    dbClient: DbClient
  ) => Promise<void>;
  reportReconciliation: (
    context: ReconciliationContext,
    error: unknown
  ) => void;
};

type SafeCompensateArgs = {
  deps: RegenerationQuotaBoundaryDeps;
  token: MeteredReservationToken;
  dbClient: DbClient;
  reconciliationContext: ReconciliationContext;
  logContext: CompensationLogContext;
};

const DEFAULT_DEPS: RegenerationQuotaBoundaryDeps = {
  reserve: (userId, dbClient) =>
    reserveMeteredUsage({ userId, meter: 'regeneration' }, dbClient),
  compensate: (token, dbClient) =>
    compensateMeteredReservation(token, dbClient),
  reportReconciliation: recordBillingReconciliationRequired,
};

export async function runRegenerationQuotaReserved<T>(
  args: RegenerationQuotaBoundaryArgs<T>,
  deps: RegenerationQuotaBoundaryDeps = DEFAULT_DEPS
): Promise<RegenerationQuotaResult<T>> {
  const { userId, planId, dbClient, work } = args;

  const reservation = await deps.reserve(userId, dbClient);
  if (!reservation.ok) {
    return {
      ok: false,
      currentCount: reservation.currentCount,
      limit: reservation.limit,
    };
  }

  const { token } = reservation;

  let workResult: RegenerationQuotaWorkResult<T>;
  try {
    workResult = await work();
  } catch (workError) {
    await safelyCompensate({
      deps,
      token,
      dbClient,
      reconciliationContext: { planId, userId },
      logContext: { planId, userId, reason: 'work_threw' },
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
      userId,
      jobId: workResult.jobId,
    },
    logContext: {
      planId,
      userId,
      reason: workResult.reason ?? 'work_revert',
      jobId: workResult.jobId,
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
    // Telemetry is treated as fire-and-forget so that a throwing
    // reconciliation helper cannot shadow the caller's original error
    // (e.g. the `workError` we are about to rethrow). Anything that
    // escapes Sentry/log here is logged separately and swallowed.
    try {
      args.deps.reportReconciliation(
        args.reconciliationContext,
        compensateError
      );
    } catch (reportError) {
      logger.error(
        { ...args.logContext, reportError },
        'Failed to report billing reconciliation alert'
      );
    }
    logger.error(
      {
        ...args.logContext,
        compensateError,
      },
      'Failed to compensate regeneration usage reservation'
    );
    return true;
  }
}
