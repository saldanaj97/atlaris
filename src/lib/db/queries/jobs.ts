import { cleanupDbClient } from '@/lib/db/queries/helpers/db-client-lifecycle';
import {
  activeRegenerationJobWhere,
  appendErrorHistoryEntry,
  assertValidJobTypes,
  clampLimit,
  mapRowToJob,
} from '@/lib/db/queries/helpers/jobs-helpers';
import { lockOwnedPlanById } from '@/lib/db/queries/helpers/plans-helpers';
import type {
  JobEnqueueResult,
  JobQueueRow,
  JobsDbClient,
  JobStats,
} from '@/lib/db/queries/types/jobs.types';
import { getDb } from '@/lib/db/runtime';
import { jobQueue } from '@/lib/db/schema';
import { db as serviceRoleDb } from '@/lib/db/service-role';
import {
  JOB_TYPES,
  type Job,
  type JobPayload,
  type JobResult,
  type JobType,
} from '@/lib/jobs/types';
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  lte,
  or,
  sql,
} from 'drizzle-orm';

/**
 * Job queue queries: enqueue, claim, complete, fail, stats, cleanup, and lookups by plan/user.
 * Uses optional dbClient for DI; defaults to getDb() for request-scoped RLS.
 */

const MAX_MONITORING_ROWS = 200;
/** Hard cap on attempts regardless of retryable override; prevents unbounded retries. */
const ABSOLUTE_MAX_ATTEMPTS = 100;
/** Cap for exponential retry delay in seconds (5 minutes). */
const MAX_RETRY_DELAY_SECONDS = 300;

export interface SystemWideJobMetrics {
  stuckJobsCount: number;
  backlogCount: number;
  pendingRegenerationCount: number;
  stuckRegenerationCount: number;
}

export async function getSystemWideJobMetrics(
  stuckThreshold: Date
): Promise<SystemWideJobMetrics> {
  const [metrics] = await serviceRoleDb
    .select({
      stuckJobsCount:
        sql<number>`count(*) filter (where ${jobQueue.status} = 'processing' and ${jobQueue.startedAt} < ${stuckThreshold})::int`.mapWith(
          Number
        ),
      backlogCount:
        sql<number>`count(*) filter (where ${jobQueue.status} = 'pending')::int`.mapWith(
          Number
        ),
      pendingRegenerationCount:
        sql<number>`count(*) filter (where ${jobQueue.status} = 'pending' and ${jobQueue.jobType} = ${JOB_TYPES.PLAN_REGENERATION})::int`.mapWith(
          Number
        ),
      stuckRegenerationCount:
        sql<number>`count(*) filter (where ${jobQueue.status} = 'processing' and ${jobQueue.jobType} = ${JOB_TYPES.PLAN_REGENERATION} and ${jobQueue.startedAt} < ${stuckThreshold})::int`.mapWith(
          Number
        ),
    })
    .from(jobQueue);

  return {
    stuckJobsCount: metrics?.stuckJobsCount ?? 0,
    backlogCount: metrics?.backlogCount ?? 0,
    pendingRegenerationCount: metrics?.pendingRegenerationCount ?? 0,
    stuckRegenerationCount: metrics?.stuckRegenerationCount ?? 0,
  };
}

const jobQueueSelect = {
  id: jobQueue.id,
  planId: jobQueue.planId,
  userId: jobQueue.userId,
  jobType: jobQueue.jobType,
  status: jobQueue.status,
  priority: jobQueue.priority,
  attempts: jobQueue.attempts,
  maxAttempts: jobQueue.maxAttempts,
  payload: jobQueue.payload,
  result: jobQueue.result,
  error: jobQueue.error,
  lockedAt: jobQueue.lockedAt,
  lockedBy: jobQueue.lockedBy,
  scheduledFor: jobQueue.scheduledFor,
  startedAt: jobQueue.startedAt,
  completedAt: jobQueue.completedAt,
  createdAt: jobQueue.createdAt,
  updatedAt: jobQueue.updatedAt,
} as const;

/** Transaction client type for use inside dbClient.transaction() callbacks. */
type JobsTransaction = Parameters<
  Parameters<JobsDbClient['transaction']>[0]
>[0];

/**
 * Locks the job row by id (SELECT FOR UPDATE) and indicates whether it is already terminal.
 * Shared by completeJobRecord and failJobRecord for idempotent guard behavior.
 *
 * @returns null if job not found, else { row, isTerminal } with isTerminal true when status is completed or failed
 */
async function lockJobAndCheckTerminal(
  tx: JobsTransaction,
  jobId: string
): Promise<{ row: JobQueueRow; isTerminal: boolean } | null> {
  const [row] = await tx
    .select(jobQueueSelect)
    .from(jobQueue)
    .where(eq(jobQueue.id, jobId))
    .for('update');

  if (!row) {
    return null;
  }

  const isTerminal = row.status === 'completed' || row.status === 'failed';
  return { row, isTerminal };
}

function computeShouldRetry(
  retryable: boolean | undefined,
  nextAttempts: number,
  maxAttempts: number,
  absoluteMaxAttempts: number
): boolean {
  if (retryable === false) {
    return false;
  }

  if (retryable === true) {
    return nextAttempts < absoluteMaxAttempts;
  }

  return nextAttempts < maxAttempts;
}

/**
 * Retrieves recent failed jobs for debugging and monitoring.
 *
 * @param limit - Max rows requested (capped at 200)
 * @param dbClient - Database client (default: getDb())
 * @returns Array of Job rows in descending completedAt order
 */
export async function getFailedJobs(
  limit: number,
  dbClient?: JobsDbClient
): Promise<Job[]> {
  const client = dbClient ?? getDb();

  const boundedLimit = clampLimit(limit, MAX_MONITORING_ROWS);
  if (boundedLimit === 0) {
    return [];
  }

  try {
    const rows = await client
      .select(jobQueueSelect)
      .from(jobQueue)
      .where(eq(jobQueue.status, 'failed'))
      .orderBy(desc(jobQueue.completedAt))
      .limit(boundedLimit);

    return rows.map(mapRowToJob);
  } finally {
    if (dbClient === undefined) {
      await cleanupDbClient(client);
    }
  }
}

/**
 * Calculates job statistics since a given timestamp: counts by status, average
 * processing time for completed jobs, and failure rate.
 *
 * @param since - Inclusive lower bound on createdAt for all aggregates
 * @param dbClient - Database client (default: getDb())
 * @returns JobStats with pending/processing/completed/failed counts, avg duration, and failure rate
 */
export async function getJobStats(
  since: Date,
  dbClient?: JobsDbClient
): Promise<JobStats> {
  const client = dbClient ?? getDb();

  try {
    const [stats] = await client
      .select({
        pendingCount: sql<number>`count(*) filter (where ${jobQueue.status} = 'pending')::int`,
        processingCount: sql<number>`count(*) filter (where ${jobQueue.status} = 'processing')::int`,
        completedCount: sql<number>`count(*) filter (where ${jobQueue.status} = 'completed')::int`,
        failedCount: sql<number>`count(*) filter (where ${jobQueue.status} = 'failed')::int`,
        averageProcessingTimeMs: sql<number | null>`avg(
          case
            when ${and(
              eq(jobQueue.status, 'completed'),
              isNotNull(jobQueue.startedAt),
              isNotNull(jobQueue.completedAt)
            )}
            then extract(epoch from (${jobQueue.completedAt} - ${jobQueue.startedAt})) * 1000
            else null
          end
        )`,
      })
      .from(jobQueue)
      .where(gte(jobQueue.createdAt, since));

    const totalCompleted = stats?.completedCount ?? 0;
    const totalFailed = stats?.failedCount ?? 0;
    const totalFinished = totalCompleted + totalFailed;
    const failureRate = totalFinished > 0 ? totalFailed / totalFinished : 0;

    const averageProcessingTimeMs =
      stats?.averageProcessingTimeMs !== null &&
      stats?.averageProcessingTimeMs !== undefined
        ? Number(stats.averageProcessingTimeMs)
        : null;

    return {
      pendingCount: stats?.pendingCount ?? 0,
      processingCount: stats?.processingCount ?? 0,
      completedCount: totalCompleted,
      failedCount: totalFailed,
      averageProcessingTimeMs,
      failureRate,
    };
  } finally {
    if (dbClient === undefined) {
      await cleanupDbClient(client);
    }
  }
}

/**
 * Deletes completed and failed jobs whose completedAt is older than the threshold.
 * Used for retention management; pending/processing jobs are never deleted.
 *
 * @param olderThan - Jobs with completedAt strictly before this date are deleted
 * @param dbClient - Database client (default: getDb())
 * @returns Number of rows deleted
 */
export async function cleanupOldJobs(
  olderThan: Date,
  dbClient?: JobsDbClient
): Promise<number> {
  const client = dbClient ?? getDb();

  try {
    const result = await client
      .delete(jobQueue)
      .where(
        and(
          or(eq(jobQueue.status, 'completed'), eq(jobQueue.status, 'failed')),
          isNotNull(jobQueue.completedAt),
          lt(jobQueue.completedAt, olderThan)
        )
      );

    return result.count ?? 0;
  } finally {
    if (dbClient === undefined) {
      await cleanupDbClient(client);
    }
  }
}

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

  try {
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
  } finally {
    if (dbClient === undefined) {
      await cleanupDbClient(client);
    }
  }
}

/**
 * Returns the single active (pending or processing) regeneration job for a plan and user, if any.
 * Used to avoid duplicate regeneration work and to surface status to the UI.
 *
 * @param planId - Plan id to check
 * @param userId - Owner user id
 * @param dbClient - Database client (default: getDb())
 * @returns The job id of the active regeneration job, or null
 */
export async function getActiveRegenerationJob(
  planId: string,
  userId: string,
  dbClient?: JobsDbClient
): Promise<{ id: string } | null> {
  const client = dbClient ?? getDb();

  try {
    const [activeJob] = await client
      .select({ id: jobQueue.id })
      .from(jobQueue)
      .where(activeRegenerationJobWhere(planId, userId))
      .orderBy(desc(jobQueue.createdAt))
      .limit(1);

    return activeJob ?? null;
  } finally {
    if (dbClient === undefined) {
      await cleanupDbClient(client);
    }
  }
}

/**
 * Atomically claims the next eligible pending job of the given types.
 * Selects by highest priority, then oldest createdAt; updates status to processing and sets startedAt.
 * Only considers jobs whose scheduledFor is <= now.
 *
 * @param types - Allowed job types to claim (e.g. [JOB_TYPES.PLAN_REGENERATION])
 * @param dbClient - Database client (default: getDb())
 * @returns The claimed job row mapped to Job, or null if none available
 */
export async function claimNextPendingJob(
  types: JobType[],
  dbClient?: JobsDbClient
): Promise<Job | null> {
  const client = dbClient ?? getDb();

  try {
    if (types.length === 0) {
      return null;
    }
    assertValidJobTypes(types);

    const startTime = new Date();
    return client.transaction(async (tx) => {
      const candidateRows = await tx
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

      const candidateIds = candidateRows.map((r) => r.id);
      if (candidateIds.length === 0) {
        return null;
      }

      const [claimed] = await tx
        .update(jobQueue)
        .set({
          status: 'processing',
          startedAt: startTime,
          updatedAt: startTime,
        })
        .where(inArray(jobQueue.id, candidateIds))
        .returning(jobQueueSelect);

      return claimed ? mapRowToJob(claimed) : null;
    });
  } finally {
    if (dbClient === undefined) {
      await cleanupDbClient(client);
    }
  }
}

/**
 * Marks a job as completed and stores the result. Idempotent: if the job is already
 * completed or failed, returns the current row without updating.
 *
 * @param jobId - Job id to complete
 * @param result - Result payload to store (type depends on job type)
 * @param dbClient - Database client (default: getDb())
 * @returns Updated job row as Job, or null if job not found
 */
export async function completeJobRecord(
  jobId: string,
  result: JobResult,
  dbClient?: JobsDbClient
): Promise<Job | null> {
  const client = dbClient ?? getDb();

  try {
    return client.transaction(async (tx) => {
      const locked = await lockJobAndCheckTerminal(tx, jobId);
      if (!locked) {
        return null;
      }
      if (locked.isTerminal) {
        return mapRowToJob(locked.row);
      }

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
  } finally {
    if (dbClient === undefined) {
      await cleanupDbClient(client);
    }
  }
}

/**
 * Marks a job as failed or schedules a retry. Appends an error entry to the job's
 * payload error history. If retryable is true (or not set and under maxAttempts),
 * status is set to pending with exponential backoff (scheduledFor); otherwise status
 * is set to failed with completedAt set.
 *
 * Retry decision: when retryable is undefined, shouldRetry follows
 * nextAttempts < current.maxAttempts. When retryable is true, it can override
 * current.maxAttempts but is bounded by ABSOLUTE_MAX_ATTEMPTS for safety.
 * When retryable is false, retry is never scheduled.
 *
 * @param jobId - Job id to fail
 * @param error - Error message to record
 * @param retryable - Optional retry override; when true, overrides maxAttempts but capped by ABSOLUTE_MAX_ATTEMPTS
 * @param dbClient - Database client (default: getDb())
 * @returns Updated job row as Job, or null if job not found or already terminal
 */
export async function failJobRecord(
  jobId: string,
  error: string,
  retryable?: boolean,
  dbClient?: JobsDbClient
): Promise<Job | null> {
  const client = dbClient ?? getDb();

  try {
    return client.transaction(async (tx) => {
      const locked = await lockJobAndCheckTerminal(tx, jobId);
      if (!locked) {
        return null;
      }
      if (locked.isTerminal) {
        return mapRowToJob(locked.row);
      }

      const current = locked.row;
      const nextAttempts = current.attempts + 1;
      const now = new Date();
      const shouldRetry = computeShouldRetry(
        retryable,
        nextAttempts,
        current.maxAttempts,
        ABSOLUTE_MAX_ATTEMPTS
      );

      const retryDelaySeconds = Math.min(
        MAX_RETRY_DELAY_SECONDS,
        Math.pow(2, nextAttempts)
      );
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
  } finally {
    if (dbClient === undefined) {
      await cleanupDbClient(client);
    }
  }
}

/**
 * Counts how many jobs of a given type were created by a user since a timestamp.
 * Used for rate limiting and usage metrics (e.g. regenerations per day).
 *
 * @param userId - User id to filter by
 * @param type - Job type to count
 * @param since - Inclusive lower bound on createdAt
 * @param dbClient - Database client (default: getDb())
 * @returns Count of matching jobs
 */
export async function countUserJobsSince(
  userId: string,
  type: JobType,
  since: Date,
  dbClient?: JobsDbClient
): Promise<number> {
  const client = dbClient ?? getDb();

  try {
    const [row] = await client
      .select({ value: sql<number>`count(*)::int` })
      .from(jobQueue)
      .where(
        and(
          eq(jobQueue.userId, userId),
          eq(jobQueue.jobType, type),
          gte(jobQueue.createdAt, since)
        )
      );

    return row?.value ?? 0;
  } finally {
    if (dbClient === undefined) {
      await cleanupDbClient(client);
    }
  }
}
