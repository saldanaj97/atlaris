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
  type InferSelectModel,
} from 'drizzle-orm';

import { getDb } from '@/lib/db/runtime';
import { jobQueue, learningPlans } from '@/lib/db/schema';
import {
  JOB_TYPES,
  type Job,
  type JobPayload,
  type JobResult,
  type JobStatus,
  type JobType,
} from '@/lib/jobs/types';

/**
 * Database row type inferred from Drizzle schema.
 * Using InferSelectModel ensures type safety without manual interface maintenance.
 */
type JobQueueRow = InferSelectModel<typeof jobQueue>;

const ALLOWED_JOB_TYPES: ReadonlySet<JobType> = Object.freeze(
  new Set(Object.values(JOB_TYPES) as JobType[])
);

export type JobsDbClient = ReturnType<typeof getDb>;

/**
 * Type guard to validate job type values at runtime.
 * Returns true if the value is a valid JobType.
 */
function isValidJobType(value: string): value is JobType {
  return ALLOWED_JOB_TYPES.has(value as JobType);
}

/**
 * Maps a database row to the domain Job model.
 * Uses type inference from Drizzle schema for the input type.
 */
function mapRowToJob(row: JobQueueRow): Job {
  // Validate jobType at runtime since DB stores as string
  const jobType = row.jobType;
  if (!isValidJobType(jobType)) {
    throw new Error(`Invalid job type in database: ${String(jobType)}`);
  }

  return {
    id: row.id,
    type: jobType,
    planId: row.planId ?? null,
    userId: row.userId,
    status: row.status,
    priority: row.priority,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    data: row.payload as JobPayload,
    result: (row.result as JobResult | null) ?? null,
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
export async function getFailedJobs(
  limit: number,
  dbClient: JobsDbClient = getDb()
): Promise<Job[]> {
  const rows = await dbClient
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
export async function getJobStats(
  since: Date,
  dbClient: JobsDbClient = getDb()
): Promise<JobStats> {
  // Get all status counts
  const allCounts = await dbClient
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
  const [avgResult] = await dbClient
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

  // PostgreSQL avg() returns numeric type, which postgres-js returns as string to preserve precision
  const averageProcessingTimeMs =
    avgResult.avgDuration !== null
      ? parseFloat(String(avgResult.avgDuration))
      : null;

  return {
    pendingCount: countsByStatus.pending,
    processingCount: countsByStatus.processing,
    completedCount: countsByStatus.completed,
    failedCount: countsByStatus.failed,
    averageProcessingTimeMs,
    failureRate,
  };
}

/**
 * Delete completed and failed jobs older than a given threshold
 * Used for retention management
 */
export async function cleanupOldJobs(
  olderThan: Date,
  dbClient: JobsDbClient = getDb()
): Promise<number> {
  const result = await dbClient
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

function assertValidJobTypes(
  values: readonly unknown[]
): asserts values is JobType[] {
  const allValid = values.every(
    (v) => typeof v === 'string' && ALLOWED_JOB_TYPES.has(v as JobType)
  );
  if (!allValid) {
    throw new Error('Invalid job type(s) received');
  }
}

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
  dbClient: JobsDbClient = getDb()
): Promise<string> {
  return dbClient.transaction(async (tx) => {
    const shouldDeduplicateRegeneration =
      type === JOB_TYPES.PLAN_REGENERATION && planId !== null;

    if (shouldDeduplicateRegeneration) {
      // Serialize enqueue attempts per plan so concurrent requests cannot create
      // duplicate pending/processing regeneration jobs. Lock the plan row first;
      // if it doesn't exist, abort to avoid creating jobQueue rows for non-existent plans.
      const [lockedPlan] = await tx
        .select({ id: learningPlans.id })
        .from(learningPlans)
        .where(eq(learningPlans.id, planId))
        .limit(1)
        .for('update');

      if (!lockedPlan?.id) {
        throw new Error(`Plan not found: ${planId}`);
      }

      const [existingActiveJob] = await tx
        .select({ id: jobQueue.id })
        .from(jobQueue)
        .where(
          and(
            eq(jobQueue.planId, planId),
            eq(jobQueue.jobType, JOB_TYPES.PLAN_REGENERATION),
            or(
              eq(jobQueue.status, 'pending'),
              eq(jobQueue.status, 'processing')
            )
          )
        )
        .orderBy(desc(jobQueue.createdAt))
        .limit(1)
        .for('update');

      if (existingActiveJob?.id) {
        return existingActiveJob.id;
      }
    }

    const [inserted] = await tx
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
  });
}

export async function claimNextPendingJob(
  types: JobType[],
  dbClient: JobsDbClient = getDb()
): Promise<Job | null> {
  if (types.length === 0) {
    return null;
  }
  assertValidJobTypes(types);

  const startTime = new Date();

  const result = await dbClient.transaction(async (tx) => {
    const rows = await tx
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
      .for('update');

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

    return updated ? mapRowToJob(updated) : null;
  });

  return result;
}

export async function completeJobRecord(
  jobId: string,
  result: JobResult,
  dbClient: JobsDbClient = getDb()
): Promise<Job | null> {
  return dbClient.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(jobQueue)
      .where(eq(jobQueue.id, jobId))
      .for('update');

    if (!current) {
      return null;
    }

    if (current.status === 'completed' || current.status === 'failed') {
      return mapRowToJob(current);
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

    return updated ? mapRowToJob(updated) : null;
  });
}

export interface FailJobOptions {
  retryable?: boolean;
  dbClient?: JobsDbClient;
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
  const { retryable, dbClient = getDb() } = options;
  return dbClient.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(jobQueue)
      .where(eq(jobQueue.id, jobId))
      .for('update');

    if (!current) {
      return null;
    }

    if (current.status === 'completed' || current.status === 'failed') {
      return mapRowToJob(current);
    }

    const nextAttempts = current.attempts + 1;
    const now = new Date();
    const reachedMaxAttempts = nextAttempts >= current.maxAttempts;
    const shouldRetry = retryable ?? !reachedMaxAttempts;

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

    return updated ? mapRowToJob(updated) : null;
  });
}

/**
 * Type guard to check if a value is a record object (not null, not array).
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Type guard to check if an array contains ErrorHistoryEntry objects.
 */
function isErrorHistoryArray(value: unknown): value is ErrorHistoryEntry[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      isRecord(item) &&
      typeof item.attempt === 'number' &&
      typeof item.error === 'string' &&
      typeof item.timestamp === 'string'
  );
}

/**
 * Appends an error entry to the payload's error history.
 * Preserves existing payload structure while adding error tracking.
 */
function appendErrorHistoryEntry(
  payload: unknown,
  entry: ErrorHistoryEntry
): Record<string, unknown> {
  const base = isRecord(payload) ? payload : {};

  const existingHistory = isErrorHistoryArray(base.errorHistory)
    ? [...base.errorHistory]
    : [];

  existingHistory.push(entry);

  return {
    ...base,
    errorHistory: existingHistory,
  };
}

export async function findJobsByPlan(
  planId: string,
  dbClient: JobsDbClient = getDb()
): Promise<Job[]> {
  const rows = await dbClient
    .select()
    .from(jobQueue)
    .where(eq(jobQueue.planId, planId))
    .orderBy(desc(jobQueue.createdAt));

  return rows.map(mapRowToJob);
}

export async function countUserJobsSince(
  userId: string,
  type: JobType,
  since: Date,
  dbClient: JobsDbClient = getDb()
): Promise<number> {
  const [row] = await dbClient
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
