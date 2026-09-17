/**
 * Regeneration quota settlement at provider start.
 *
 * HTTP enqueue peeks current usage without settling. This boundary increments
 * the regeneration meter when the provider is about to run so pre-provider
 * failures do not consume and post-provider failures stay consumed.
 */

import type { DbClient } from '@/lib/db/types';

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

    const quota = await reserveMeteredUsageInTx(tx, args.userId);
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
