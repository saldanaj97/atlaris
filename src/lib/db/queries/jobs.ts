import { and, desc, eq, gte, isNotNull, lt, or, sql } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { jobQueue } from '@/lib/db/schema';
import {
  JOB_TYPES,
  type Job,
  type JobStatus,
  type JobType,
} from '@/lib/jobs/types';

interface JobRow {
  id: string;
  jobType: string;
  planId: string | null;
  userId: string;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  payload: unknown;
  result: unknown;
  error: string | null;
  lockedAt: Date | null;
  lockedBy: string | null;
  scheduledFor: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function mapRowToJob(row: JobRow): Job {
  return {
    id: row.id,
    type: row.jobType as Job['type'],
    planId: row.planId ?? null,
    userId: row.userId,
    status: row.status,
    priority: row.priority,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    data: row.payload,
    result: row.result ?? null,
    error: row.error ?? null,
    processingStartedAt: row.startedAt ?? null,
    completedAt: row.completedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Retrieve recent failed jobs for debugging and monitoring
 */
export async function getFailedJobs(limit: number): Promise<Job[]> {
  const rows = await db
    .select()
    .from(jobQueue)
    .where(eq(jobQueue.status, 'failed'))
    .orderBy(desc(jobQueue.completedAt))
    .limit(limit);

  return rows.map(mapRowToJob);
}

export interface JobStats {
  pendingCount: number;
  processingCount: number;
  completedCount: number;
  failedCount: number;
  averageProcessingTimeMs: number | null;
  failureRate: number;
}

/**
 * Calculate job statistics since a given timestamp
 */
export async function getJobStats(since: Date): Promise<JobStats> {
  // Get all status counts
  const allCounts = await db
    .select({
      status: jobQueue.status,
      count: sql<number>`count(*)::int`,
    })
    .from(jobQueue)
    .where(gte(jobQueue.createdAt, since))
    .groupBy(jobQueue.status);

  const countsByStatus = allCounts.reduce(
    (acc, row) => {
      acc[row.status] = row.count;
      return acc;
    },
    {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    } as Record<JobStatus, number>
  );

  // Calculate average processing time for completed jobs
  const [avgResult] = await db
    .select({
      avgDuration: sql<number | null>`avg(
        extract(epoch from (${jobQueue.completedAt} - ${jobQueue.startedAt})) * 1000
      )`,
    })
    .from(jobQueue)
    .where(
      and(
        eq(jobQueue.status, 'completed'),
        gte(jobQueue.createdAt, since),
        sql`${jobQueue.startedAt} is not null`,
        sql`${jobQueue.completedAt} is not null`
      )
    );

  const totalCompleted = countsByStatus.completed;
  const totalFailed = countsByStatus.failed;
  const totalFinished = totalCompleted + totalFailed;
  const failureRate = totalFinished > 0 ? totalFailed / totalFinished : 0;

  return {
    pendingCount: countsByStatus.pending,
    processingCount: countsByStatus.processing,
    completedCount: countsByStatus.completed,
    failedCount: countsByStatus.failed,
    averageProcessingTimeMs: avgResult.avgDuration,
    failureRate,
  };
}

/**
 * Delete completed and failed jobs older than a given threshold
 * Used for retention management
 */
export async function cleanupOldJobs(olderThan: Date): Promise<number> {
  const result = await db
    .delete(jobQueue)
    .where(
      and(
        or(eq(jobQueue.status, 'completed'), eq(jobQueue.status, 'failed')),
        isNotNull(jobQueue.completedAt),
        lt(jobQueue.completedAt, olderThan)
      )
    );

  // postgres-js returns a result with a count property
  return result.count ?? 0;
}

const ALLOWED_JOB_TYPES = new Set(Object.values(JOB_TYPES));

function assertValidJobTypes(
  values: readonly unknown[]
): asserts values is JobType[] {
  if (
    !values.every(
      (v) => typeof v === 'string' && ALLOWED_JOB_TYPES.has(v as JobType)
    )
  ) {
    throw new Error('Invalid job type(s) received');
  }
}

export async function insertJobRecord({
  type,
  planId,
  userId,
  data,
  priority,
}: {
  type: JobType;
  planId: string | null;
  userId: string;
  data: unknown;
  priority: number;
}): Promise<string> {
  const [inserted] = await db
    .insert(jobQueue)
    .values({
      jobType: type,
      planId: planId ?? null,
      userId,
      status: 'pending',
      priority,
      payload: data,
    })
    .returning({ id: jobQueue.id });

  if (!inserted?.id) {
    throw new Error('Failed to enqueue job');
  }

  return inserted.id;
}

export async function claimNextPendingJob(
  types: JobType[]
): Promise<Job | null> {
  if (types.length === 0) {
    return null;
  }
  assertValidJobTypes(types);

  const startTime = new Date();

  const result = await db.transaction(async (tx) => {
    const rows = (await tx.execute(sql`
      select id
      from job_queue
      where status = 'pending'
        and job_type = any(${sql.array(types, 'text')})
        and scheduled_for <= now()
      order by priority desc, created_at asc
      limit 1
      for update skip locked
    `)) as Array<{ id: string }>;

    const selectedId = rows[0]?.id;
    if (!selectedId) {
      return null;
    }

    const [updated] = await tx
      .update(jobQueue)
      .set({
        status: 'processing',
        startedAt: startTime,
        updatedAt: startTime,
      })
      .where(eq(jobQueue.id, selectedId))
      .returning();

    return updated ? mapRowToJob(updated as JobRow) : null;
  });

  return result;
}

export async function completeJobRecord(
  jobId: string,
  result: unknown
): Promise<Job | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(jobQueue)
      .where(eq(jobQueue.id, jobId))
      .for('update');

    if (!current) {
      return null;
    }

    if (current.status === 'completed' || current.status === 'failed') {
      return mapRowToJob(current as JobRow);
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
      .returning();

    return updated ? mapRowToJob(updated as JobRow) : null;
  });
}

export interface FailJobOptions {
  retryable?: boolean;
}

type ErrorHistoryEntry = {
  attempt: number;
  error: string;
  timestamp: string;
};

export async function failJobRecord(
  jobId: string,
  error: string,
  options: FailJobOptions = {}
): Promise<Job | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(jobQueue)
      .where(eq(jobQueue.id, jobId))
      .for('update');

    if (!current) {
      return null;
    }

    if (current.status === 'completed' || current.status === 'failed') {
      return mapRowToJob(current as JobRow);
    }

    const nextAttempts = current.attempts + 1;
    const now = new Date();
    const reachedMaxAttempts = nextAttempts >= current.maxAttempts;
    const shouldRetry = options.retryable ?? !reachedMaxAttempts;

    const retryDelaySeconds = Math.min(60, Math.pow(2, nextAttempts));
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
      .returning();

    return updated ? mapRowToJob(updated as JobRow) : null;
  });
}

function appendErrorHistoryEntry(
  payload: unknown,
  entry: ErrorHistoryEntry
): Record<string, unknown> {
  const base =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const baseWithHistory = base as { errorHistory?: unknown };
  const existingHistory = Array.isArray(baseWithHistory.errorHistory)
    ? [...(baseWithHistory.errorHistory as ErrorHistoryEntry[])]
    : [];
  existingHistory.push(entry);
  return {
    ...base,
    errorHistory: existingHistory,
  };
}

export async function findJobsByPlan(planId: string): Promise<Job[]> {
  const rows = await db
    .select()
    .from(jobQueue)
    .where(eq(jobQueue.planId, planId))
    .orderBy(desc(jobQueue.createdAt));

  return rows.map(mapRowToJob);
}

export async function countUserJobsSince(
  userId: string,
  type: JobType,
  since: Date
): Promise<number> {
  const [row] = await db
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
}
