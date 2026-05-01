import { and, desc, eq, gte, isNotNull, lt, or, sql } from 'drizzle-orm';
import {
  activeRegenerationJobWhere,
  clampLimit,
  mapRowToJob,
} from '@/lib/db/queries/helpers/jobs-helpers';
import type { JobStats, JobsDbClient } from '@/lib/db/queries/types/jobs.types';
import { getDb } from '@/lib/db/runtime';
import { jobQueue } from '@/lib/db/schema';
import { MAX_JOB_MONITORING_ROWS } from '@/lib/db/schema/constants';
import type { Job, JobType } from '@/shared/types/jobs.types';
import { jobQueueSelect, normalizeMutationCount } from './shared';

/**
 * Retrieves recent failed jobs for debugging and monitoring.
 */
export async function getFailedJobs(
  limit: number,
  dbClient?: JobsDbClient,
): Promise<Job[]> {
  const client = dbClient ?? getDb();

  const boundedLimit = clampLimit(limit, MAX_JOB_MONITORING_ROWS);
  if (boundedLimit === 0) {
    return [];
  }

  const rows = await client
    .select(jobQueueSelect)
    .from(jobQueue)
    .where(eq(jobQueue.status, 'failed'))
    .orderBy(
      desc(jobQueue.completedAt),
      desc(jobQueue.createdAt),
      desc(jobQueue.id),
    )
    .limit(boundedLimit);

  return rows.map(mapRowToJob);
}

/**
 * Calculates job statistics since a given timestamp.
 */
export async function getJobStats(
  since: Date,
  dbClient?: JobsDbClient,
): Promise<JobStats> {
  const client = dbClient ?? getDb();

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
            isNotNull(jobQueue.completedAt),
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
}

/**
 * Deletes completed and failed jobs whose completedAt is older than the threshold.
 */
export async function cleanupOldJobs(
  olderThan: Date,
  dbClient?: JobsDbClient,
): Promise<number> {
  const client = dbClient ?? getDb();

  const result = await client
    .delete(jobQueue)
    .where(
      and(
        or(eq(jobQueue.status, 'completed'), eq(jobQueue.status, 'failed')),
        isNotNull(jobQueue.completedAt),
        lt(jobQueue.completedAt, olderThan),
      ),
    );

  return normalizeMutationCount(result);
}

/**
 * Returns the single active (pending or processing) regeneration job for a plan and user, if any.
 */
export async function getActiveRegenerationJob(
  planId: string,
  userId: string,
  dbClient?: JobsDbClient,
): Promise<{ id: string } | null> {
  const client = dbClient ?? getDb();

  const [activeJob] = await client
    .select({ id: jobQueue.id })
    .from(jobQueue)
    .where(activeRegenerationJobWhere(planId, userId))
    .orderBy(desc(jobQueue.createdAt))
    .limit(1);

  return activeJob ?? null;
}

/**
 * Counts how many jobs of a given type were created by a user since a timestamp.
 */
export async function countUserJobsSince(
  userId: string,
  type: JobType,
  since: Date,
  dbClient?: JobsDbClient,
): Promise<number> {
  const client = dbClient ?? getDb();

  const [row] = await client
    .select({ value: sql<number>`count(*)::int` })
    .from(jobQueue)
    .where(
      and(
        eq(jobQueue.userId, userId),
        eq(jobQueue.jobType, type),
        gte(jobQueue.createdAt, since),
      ),
    );

  return row?.value ?? 0;
}
