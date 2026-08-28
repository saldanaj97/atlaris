/**
 * Regeneration-focused quota reservation boundary.
 *
 * Owns the reserve / run-work / compensate / reconcile lifecycle for monthly
 * regeneration usage. HTTP enqueue peeks current usage without settling; this
 * boundary is invoked at provider start so pre-provider failures compensate and
 * post-provider failures remain consumed.
 */

import type { DbClient } from '@/lib/db/types';

import {
  createServiceRoleMeteredBoundaryDeps,
  runMeteredQuotaReserved,
  type MeteredQuotaBoundaryDeps,
  type MeteredQuotaResult,
} from './metered-quota-boundary-core';
import {
  reserveMeteredUsageInTx,
  type ReserveMeteredResult,
} from './metered-reservation';
import { planRegenerationJobPayloadSchema } from '@/features/plans/regeneration-orchestration/schema';
import { JOB_TYPES } from '@/shared/types/jobs.types';
import { jobQueue } from '@supabase/schema';
import { and, eq } from 'drizzle-orm';

export type RegenerationProviderStartQuotaResult =
  | {
      ok: true;
      providerStartedAt: string;
      alreadySettled: boolean;
    }
  | Extract<ReserveMeteredResult, { ok: false }>;

/**
 * Settles regeneration usage at the provider boundary.
 *
 * The job row is locked before the usage row is touched. The durable marker
 * and counter increment commit in the same transaction, so a marker parse or
 * persistence failure rolls the counter back before the provider can run.
 * A marker already present on the active job is the replay/idempotency guard;
 * retries clear it before a new attempt is allowed to settle.
 */
export async function reserveRegenerationQuotaAtProviderStart(args: {
  userId: string;
  planId: string;
  jobId: string;
  dbClient: DbClient;
}): Promise<RegenerationProviderStartQuotaResult> {
  return await args.dbClient.transaction(async (tx) => {
    const [job] = await tx
      .select({
        status: jobQueue.status,
        payload: jobQueue.payload,
      })
      .from(jobQueue)
      .where(
        and(
          eq(jobQueue.id, args.jobId),
          eq(jobQueue.jobType, JOB_TYPES.PLAN_REGENERATION),
          eq(jobQueue.planId, args.planId),
          eq(jobQueue.userId, args.userId),
        ),
      )
      .for('update');

    if (!job || job.status !== 'processing') {
      throw new Error(
        'Failed to persist regeneration provider-start marker: job is not processing.',
      );
    }

    const payload = planRegenerationJobPayloadSchema.safeParse(job.payload);
    if (!payload.success) {
      throw new Error(
        'Failed to persist regeneration provider-start marker: invalid job payload.',
      );
    }

    const existingMarker = payload.data.quota?.providerStartedAt;
    if (existingMarker) {
      return {
        ok: true,
        providerStartedAt: existingMarker,
        alreadySettled: true,
      };
    }

    const markerDate = new Date();
    const providerStartedAt = markerDate.toISOString();
    const marked = planRegenerationJobPayloadSchema.safeParse({
      ...payload.data,
      quota: { providerStartedAt },
    });
    if (!marked.success) {
      throw new Error(
        'Failed to persist regeneration provider-start marker: invalid job payload.',
      );
    }

    const quota = await reserveMeteredUsageInTx(tx, {
      userId: args.userId,
      meter: 'regeneration',
    });
    if (!quota.ok) {
      return quota;
    }

    const [persisted] = await tx
      .update(jobQueue)
      .set({
        payload: marked.data,
        updatedAt: markerDate,
      })
      .where(eq(jobQueue.id, args.jobId))
      .returning({
        status: jobQueue.status,
        payload: jobQueue.payload,
      });

    const persistedPayload = persisted
      ? planRegenerationJobPayloadSchema.safeParse(persisted.payload)
      : null;
    if (
      !persisted ||
      persisted.status !== 'processing' ||
      !persistedPayload?.success ||
      persistedPayload.data.quota?.providerStartedAt !== providerStartedAt
    ) {
      throw new Error(
        'Failed to persist regeneration provider-start marker: job state did not match.',
      );
    }

    return {
      ok: true,
      providerStartedAt,
      alreadySettled: false,
    };
  });
}

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
 * - `ok: false` means quota was denied at reserve time; caller should map to 429 `REGENERATION_QUOTA_EXCEEDED`.
 * - `ok: true, consumed: true` means the reservation stuck and the route should accept the request.
 * - `ok: true, consumed: false` means the reservation was reverted; route should map to 409 (or its caller-defined conflict). `reconciliationRequired` is true when the compensation step itself failed.
 */
type RegenerationQuotaResult<
  TConsumed,
  TReverted = TConsumed,
> = MeteredQuotaResult<TConsumed, TReverted>;

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
