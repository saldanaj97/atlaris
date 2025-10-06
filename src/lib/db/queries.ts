import { and, desc, eq, gte, isNotNull, lt, or, sql } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { jobQueue } from '@/lib/db/schema';
import { type Job, type JobStatus } from '@/lib/jobs/types';

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
