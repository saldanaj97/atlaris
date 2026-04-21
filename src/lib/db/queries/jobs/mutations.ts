import { and, desc, eq, inArray, lte } from 'drizzle-orm';
import {
  activeRegenerationJobWhere,
  appendErrorHistoryEntry,
  assertValidJobTypes,
  mapRowToJob,
} from '@/lib/db/queries/helpers/jobs-helpers';
import { lockOwnedPlanById } from '@/lib/db/queries/helpers/plans-helpers';
import type {
  JobEnqueueResult,
  JobsDbClient,
} from '@/lib/db/queries/types/jobs.types';
import { getDb } from '@/lib/db/runtime';
import { jobQueue } from '@/lib/db/schema';
import {
  JOB_TYPES,
  type Job,
  type JobPayload,
  type JobResult,
  type JobType,
} from '@/shared/types/jobs.types';
import {
  computeShouldRetry,
  getRetryDelaySeconds,
  jobQueueSelect,
  runJobMutationIfEditable,
} from './shared';

/**
 * Inserts a new job into the queue. For plan regeneration jobs with a planId,
 * deduplicates by returning the existing active job id if one is already pending/processing.
 * Uses a transaction with row locks to avoid race conditions.
 *
 * @param params - Job payload: type, planId (nullable), userId, data, priority
 * @param dbClient - Database client (default: getDb())
 * @returns Enqueue result with job id and whether it was deduplicated
 * @throws Error if plan not found when deduplicating regeneration, or if insert fails
 */
export async function insertJobRecord(
  {
    type,
    planId,
    userId,
    data,
    priority,
  }: {
    type: JobType;
    planId: string | null;
    userId: string;
    data: JobPayload;
    priority: number;
  },
  dbClient?: JobsDbClient
): Promise<JobEnqueueResult> {
  const client = dbClient ?? getDb();

  return client.transaction(async (tx) => {
    const shouldDeduplicateRegeneration =
      type === JOB_TYPES.PLAN_REGENERATION && planId !== null;

    if (shouldDeduplicateRegeneration) {
      const lockedPlan = await lockOwnedPlanById({
        planId,
        ownerUserId: userId,
        dbClient: tx,
      });

      if (!lockedPlan) {
        throw new Error(`Plan not found or inaccessible: ${planId}`);
      }

      const [existingActiveJob] = await tx
        .select({ id: jobQueue.id })
        .from(jobQueue)
        .where(activeRegenerationJobWhere(planId, userId))
        .orderBy(desc(jobQueue.createdAt))
        .limit(1)
        .for('update');

      if (existingActiveJob?.id) {
        return { id: existingActiveJob.id, deduplicated: true };
      }
    }

    const [inserted] = await tx
      .insert(jobQueue)
      .values({
        jobType: type,
        planId,
        userId,
        status: 'pending',
        priority,
        payload: data,
      })
      .returning({ id: jobQueue.id });

    if (!inserted?.id) {
      throw new Error('Failed to enqueue job');
    }

    return { id: inserted.id, deduplicated: false };
  });
}

/**
 * Atomically claims the next eligible pending job of the given types.
 * Selects by highest priority, then oldest createdAt; updates status to processing and sets startedAt.
 * Only considers jobs whose scheduledFor is <= now.
 */
export async function claimNextPendingJob(
  types: JobType[],
  dbClient?: JobsDbClient
): Promise<Job | null> {
  const client = dbClient ?? getDb();

  if (types.length === 0) {
    return null;
  }
  assertValidJobTypes(types);

  const startTime = new Date();
  return client.transaction(async (tx) => {
    const [candidate] = await tx
      .select({ id: jobQueue.id })
      .from(jobQueue)
      .where(
        and(
          eq(jobQueue.status, 'pending'),
          inArray(jobQueue.jobType, types),
          lte(jobQueue.scheduledFor, startTime)
        )
      )
      .orderBy(desc(jobQueue.priority), jobQueue.createdAt)
      .limit(1)
      .for('update', { skipLocked: true });

    if (!candidate) {
      return null;
    }

    const [claimed] = await tx
      .update(jobQueue)
      .set({
        status: 'processing',
        startedAt: startTime,
        updatedAt: startTime,
      })
      .where(eq(jobQueue.id, candidate.id))
      .returning(jobQueueSelect);

    return claimed ? mapRowToJob(claimed) : null;
  });
}

/**
 * Marks a job as completed and stores the result. Idempotent: if the job is already
 * completed or failed, returns the current row without updating.
 */
export async function completeJobRecord(
  jobId: string,
  result: JobResult,
  dbClient?: JobsDbClient
): Promise<Job | null> {
  const client = dbClient ?? getDb();

  return runJobMutationIfEditable(client, jobId, async (tx) => {
    const completedAt = new Date();
    const [updated] = await tx
      .update(jobQueue)
      .set({
        status: 'completed',
        result,
        error: null,
        completedAt,
        updatedAt: completedAt,
      })
      .where(eq(jobQueue.id, jobId))
      .returning(jobQueueSelect);

    return updated ? mapRowToJob(updated) : null;
  });
}

/**
 * Marks a job as failed or schedules a retry. Appends an error entry to the job's
 * payload error history.
 */
export async function failJobRecord(
  jobId: string,
  error: string,
  retryable?: boolean,
  dbClient?: JobsDbClient
): Promise<Job | null> {
  const client = dbClient ?? getDb();

  return runJobMutationIfEditable(client, jobId, async (tx, current) => {
    const nextAttempts = current.attempts + 1;
    const now = new Date();
    const shouldRetry = computeShouldRetry(
      retryable,
      nextAttempts,
      current.maxAttempts
    );

    const retryDelaySeconds = getRetryDelaySeconds(nextAttempts);
    const scheduledForRetry = new Date(
      now.getTime() + retryDelaySeconds * 1000
    );

    const payloadWithHistory = appendErrorHistoryEntry(current.payload, {
      attempt: nextAttempts,
      error,
      timestamp: now.toISOString(),
    });

    const updatePayload = shouldRetry
      ? {
          attempts: nextAttempts,
          status: 'pending' as const,
          error: null,
          result: null,
          completedAt: null,
          startedAt: null,
          scheduledFor: scheduledForRetry,
          updatedAt: now,
          payload: payloadWithHistory,
        }
      : {
          attempts: nextAttempts,
          status: 'failed' as const,
          error,
          result: null,
          completedAt: now,
          startedAt: current.startedAt,
          updatedAt: now,
          payload: payloadWithHistory,
        };

    const [updated] = await tx
      .update(jobQueue)
      .set(updatePayload)
      .where(eq(jobQueue.id, jobId))
      .returning(jobQueueSelect);

    return updated ? mapRowToJob(updated) : null;
  });
}
