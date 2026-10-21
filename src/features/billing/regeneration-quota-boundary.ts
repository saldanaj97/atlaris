/**
 * Regeneration quota settlement at provider start.
 *
 * HTTP enqueue peeks current usage without settling. This boundary increments
 * the regeneration meter when the provider is about to run so pre-provider
 * failures do not consume and post-provider failures stay consumed.
 *
 * A grounded regeneration on a tier with a per-plan cap (Free: one per plan,
 * JCS-162) counts this plan's regeneration jobs that reached provider start
 * instead of the monthly meter.
 */

import type { BillingTx } from './metered-reservation';
import type { DbClient } from '@/lib/db/types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import {
  reserveMeteredUsageInTx,
  type ReserveMeteredResult,
} from './metered-reservation';
import { getGroundedOperationPolicy } from '@/features/ai/model-operation-policy';
import { planRegenerationJobPayloadSchema } from '@/features/plans/regeneration-orchestration/schema';
import { JOB_TYPES } from '@/shared/types/jobs.types';
import { jobQueue, learningPlans } from '@supabase/schema';
import { and, count, eq, ne, sql } from 'drizzle-orm';

export type RegenerationProviderStartQuotaResult =
  | {
      ok: true;
      providerStartedAt: string;
      alreadySettled: boolean;
    }
  | Extract<ReserveMeteredResult, { ok: false }>;

/**
 * This plan's regeneration jobs that reached provider start (their payload
 * holds `quota.providerStartedAt`), leaving out `excludeJobId`.
 */
export async function countProviderStartedRegenerations(args: {
  planId: string;
  excludeJobId?: string;
  dbClient: DbClient | BillingTx;
}): Promise<number> {
  const [row] = await args.dbClient
    .select({ value: count() })
    .from(jobQueue)
    .where(
      and(
        eq(jobQueue.jobType, JOB_TYPES.PLAN_REGENERATION),
        eq(jobQueue.planId, args.planId),
        sql`${jobQueue.payload}->'quota'->>'providerStartedAt' IS NOT NULL`,
        args.excludeJobId === undefined
          ? undefined
          : ne(jobQueue.id, args.excludeJobId),
      ),
    );
  return row?.value ?? 0;
}

/** The per-plan cap for a grounded regeneration, or `null` for the monthly meter. */
export function groundedRegenerationPlanCap(
  groundedTier: SubscriptionTier | undefined,
): number | null {
  if (groundedTier === undefined) {
    return null;
  }
  const policy = getGroundedOperationPolicy(groundedTier, 'regeneration');
  return policy.allowed ? policy.quotaPerPlan : null;
}

/**
 * Settles regeneration usage at the provider boundary.
 *
 * The job row is locked before the usage row is touched. The durable marker
 * and counter increment commit in the same transaction, so a marker parse or
 * persistence failure rolls the counter back before the provider can run.
 * A marker already present on the active job is the replay/idempotency guard;
 * retries clear it before a new attempt is allowed to settle.
 *
 * `groundedTier` is set for a grounded regeneration; when its policy caps
 * runs per plan, the plan row is locked and the other marked jobs counted.
 */
export async function reserveRegenerationQuotaAtProviderStart(args: {
  userId: string;
  planId: string;
  jobId: string;
  dbClient: DbClient;
  groundedTier?: SubscriptionTier;
}): Promise<RegenerationProviderStartQuotaResult> {
  const planCap = groundedRegenerationPlanCap(args.groundedTier);
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

    if (planCap === null) {
      const quota = await reserveMeteredUsageInTx(tx, args.userId);
      if (!quota.ok) {
        return quota;
      }
    } else {
      await tx
        .select({ id: learningPlans.id })
        .from(learningPlans)
        .where(eq(learningPlans.id, args.planId))
        .for('update');
      const used = await countProviderStartedRegenerations({
        planId: args.planId,
        excludeJobId: args.jobId,
        dbClient: tx,
      });
      if (used >= planCap) {
        return { ok: false, currentCount: used, limit: planCap };
      }
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
