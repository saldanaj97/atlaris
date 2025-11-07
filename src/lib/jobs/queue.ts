import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { jobQueue } from '@/lib/db/schema';
import { JOB_TYPES, type Job, type JobType } from './types';

type JobRow = InferSelectModel<typeof jobQueue>;

function mapRowToJob(row: JobRow): Job {
  return {
    id: row.id,
    type: row.jobType,
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

export async function enqueueJob(
  type: JobType,
  planId: string | null,
  userId: string,
  data: unknown,
  priority = 0
): Promise<string> {
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

export async function getNextJob(types: JobType[]): Promise<Job | null> {
  if (types.length === 0) {
    return null;
  }

  assertValidJobTypes(types);

  const startTime = new Date();

  const result = await db.transaction(async (tx) => {
    const typeFilter = inArray(jobQueue.jobType, types);
    const rows = (await tx.execute(sql`
      select id
      from job_queue
      where status = 'pending'
        and ${typeFilter}
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

    return updated ? mapRowToJob(updated) : null;
  });

  return result;
}

export async function completeJob(
  jobId: string,
  result: unknown
): Promise<Job | null> {
  return db.transaction(async (tx) => {
    const current = await tx.query.jobQueue.findFirst({
      where: (fields, operators) => operators.eq(fields.id, jobId),
    });

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

    return updated ? mapRowToJob(updated) : mapRowToJob(current);
  });
}

export interface FailJobOptions {
  retryable?: boolean;
}

export async function failJob(
  jobId: string,
  error: string,
  options: FailJobOptions = {}
): Promise<Job | null> {
  return db.transaction(async (tx) => {
    const current = await tx.query.jobQueue.findFirst({
      where: (fields, operators) => operators.eq(fields.id, jobId),
    });

    if (!current) {
      return null;
    }

    if (current.status === 'completed' || current.status === 'failed') {
      return mapRowToJob(current);
    }

    const nextAttempts = current.attempts + 1;
    const now = new Date();
    const reachedMaxAttempts = nextAttempts >= current.maxAttempts;
    const shouldRetry = options.retryable ?? !reachedMaxAttempts;

    const updatePayload = shouldRetry
      ? {
          attempts: nextAttempts,
          status: 'pending' as const,
          error: null,
          result: null,
          completedAt: null,
          startedAt: null,
          updatedAt: now,
        }
      : {
          attempts: nextAttempts,
          status: 'failed' as const,
          error,
          result: null,
          completedAt: now,
          startedAt: null,
          updatedAt: now,
        };

    const [updated] = await tx
      .update(jobQueue)
      .set(updatePayload)
      .where(eq(jobQueue.id, jobId))
      .returning();

    return updated ? mapRowToJob(updated) : mapRowToJob(current);
  });
}

export async function getJobsByPlanId(planId: string): Promise<Job[]> {
  const rows = await db
    .select()
    .from(jobQueue)
    .where(eq(jobQueue.planId, planId))
    .orderBy(desc(jobQueue.createdAt));

  return rows.map(mapRowToJob);
}

export async function getUserJobCount(
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
