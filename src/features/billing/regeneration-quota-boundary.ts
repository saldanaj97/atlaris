/**
 * Regeneration-focused quota reservation boundary.
 *
 * Owns the reserve / run-work / compensate / reconcile lifecycle for the
 * regeneration HTTP path so route handlers do not have to thread together
 * billing primitives, queue dedupe, and Sentry telemetry.
 *
 * Phase-1 scope is intentionally regeneration-only; exports and any other
 * meter continue to flow through their existing wrappers until they are
 * migrated onto the same private metered-reservation core.
 */

import type { DbClient } from '@/lib/db/types';

import {
  createServiceRoleMeteredBoundaryDeps,
  runMeteredQuotaReserved,
  type MeteredQuotaBoundaryDeps,
} from './metered-quota-boundary-core';

/**
 * Outcome the caller's `work()` function returns to describe what should
 * happen to the reservation that the boundary just took out.
 *
 * @property disposition - `'consumed'` keeps the reservation; `'revert'` triggers compensation in the same month bucket.
 * @property value - Forwarded back to the caller in the success result (`consumed` vs `revert` may use different shapes).
 * @property reason - Free-form revert tag for telemetry (e.g. `'enqueue_deduplicated'`).
 * @property jobId - Job id correlated with the revert, when one exists.
 */
export type RegenerationQuotaWorkResult<TConsumed, TReverted = TConsumed> =
  | { disposition: 'consumed'; value: TConsumed }
  | {
      disposition: 'revert';
      value: TReverted;
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
type RegenerationQuotaResult<TConsumed, TReverted = TConsumed> =
  | { ok: true; consumed: true; value: TConsumed }
  | {
      ok: true;
      consumed: false;
      value: TReverted;
      reconciliationRequired: boolean;
    }
  | { ok: false; currentCount: number; limit: number };

type RegenerationQuotaBoundaryArgs<TConsumed, TReverted = TConsumed> = {
  userId: string;
  planId: string;
  dbClient: DbClient;
  work: () => Promise<RegenerationQuotaWorkResult<TConsumed, TReverted>>;
};

/**
 * Injectable seam for unit tests. Defaults wire production billing primitives
 * and Sentry telemetry; callers should not pass overrides outside tests.
 *
 * `reportReconciliation` accepts `unknown` because the failure originates from
 * a `catch` clause where TypeScript surfaces caught values as `unknown`. The
 * default implementation normalizes to `Error` before forwarding to Sentry.
 */
export type RegenerationQuotaBoundaryDeps = MeteredQuotaBoundaryDeps;

const DEFAULT_DEPS = createServiceRoleMeteredBoundaryDeps('regeneration');

export async function runRegenerationQuotaReserved<
  TConsumed,
  TReverted = TConsumed,
>(
  args: RegenerationQuotaBoundaryArgs<TConsumed, TReverted>,
  deps: RegenerationQuotaBoundaryDeps = DEFAULT_DEPS,
): Promise<RegenerationQuotaResult<TConsumed, TReverted>> {
  const { userId, planId, dbClient, work } = args;

  return await runMeteredQuotaReserved<
    TConsumed,
    TReverted,
    RegenerationQuotaWorkResult<TConsumed, TReverted>
  >(
    {
      userId,
      dbClient,
      work,
      buildWorkThrowContexts: () => ({
        reconciliationContext: { planId, userId },
        logContext: { planId, userId, reason: 'work_threw' },
      }),
      buildRevertContexts: (workResult) => ({
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
      }),
      compensationFailureMessage:
        'Failed to compensate regeneration usage reservation',
    },
    deps,
  );
}
