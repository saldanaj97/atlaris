import type {
  ErrorHistoryEntry,
  JobQueueRow,
} from '@/lib/db/queries/types/jobs.types';

import {
  JOB_TYPES,
  type Job,
  type JobPayload,
  type JobResult,
  type JobType,
} from '@/shared/types/jobs.types';
import { jobQueue } from '@supabase/schema';
import { and, eq, or } from 'drizzle-orm';

const ALLOWED_JOB_TYPES: ReadonlySet<JobType> = Object.freeze(
  new Set(Object.values(JOB_TYPES) as JobType[]),
);

export function activeRegenerationJobWhere(planId: string, userId: string) {
  return and(
    eq(jobQueue.planId, planId),
    eq(jobQueue.userId, userId),
    eq(jobQueue.jobType, JOB_TYPES.PLAN_REGENERATION),
    or(eq(jobQueue.status, 'pending'), eq(jobQueue.status, 'processing')),
  );
}

function isValidJobType(value: string): value is JobType {
  return ALLOWED_JOB_TYPES.has(value as JobType);
}

export function mapRowToJob(row: JobQueueRow): Job {
  const jobType = assertJobTypeForRow(row.jobType);

  return mapValidatedRowToJob(row, jobType);
}

function assertJobTypeForRow(jobType: string): JobType {
  if (!isValidJobType(jobType)) {
    throw new Error(`Invalid job type in database: ${String(jobType)}`);
  }
  return jobType;
}

function mapValidatedRowToJob(row: JobQueueRow, jobType: JobType): Job {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isErrorHistoryArray(value: unknown): value is ErrorHistoryEntry[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      isRecord(item) &&
      typeof item.attempt === 'number' &&
      typeof item.error === 'string' &&
      typeof item.timestamp === 'string',
  );
}

/**
 * Appends an error entry to the payload's error history.
 * Preserves existing payload structure while adding error tracking.
 */
export function appendErrorHistoryEntry(
  payload: unknown,
  entry: ErrorHistoryEntry,
): Record<string, unknown> {
  const base = isRecord(payload) ? payload : {};
  const existingHistory = copyErrorHistoryFromPayload(base);

  existingHistory.push(entry);

  return {
    ...base,
    errorHistory: existingHistory,
  };
}

function copyErrorHistoryFromPayload(
  base: Record<string, unknown>,
): ErrorHistoryEntry[] {
  return isErrorHistoryArray(base.errorHistory) ? [...base.errorHistory] : [];
}
