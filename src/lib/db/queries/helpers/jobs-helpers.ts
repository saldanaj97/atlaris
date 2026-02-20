import { and, eq, or } from 'drizzle-orm';

import { jobQueue } from '@/lib/db/schema';
import {
  JOB_TYPES,
  type Job,
  type JobPayload,
  type JobResult,
  type JobType,
} from '@/lib/jobs/types';

import type {
  ErrorHistoryEntry,
  JobQueueRow,
} from '@/lib/db/queries/types/jobs.types';

const ALLOWED_JOB_TYPES: ReadonlySet<JobType> = Object.freeze(
  new Set(Object.values(JOB_TYPES) as JobType[])
);

/**
 * Clamps a numeric limit to [0, max], truncating non-integers. Non-finite values become max.
 */
export function clampLimit(limit: number, max: number): number {
  if (!Number.isFinite(limit)) {
    return max;
  }
  return Math.max(0, Math.min(Math.trunc(limit), max));
}

/** Shared predicate for "active" regeneration job (pending or processing) for a plan/user. */
export function activeRegenerationJobWhere(planId: string, userId: string) {
  return and(
    eq(jobQueue.planId, planId),
    eq(jobQueue.userId, userId),
    eq(jobQueue.jobType, JOB_TYPES.PLAN_REGENERATION),
    or(eq(jobQueue.status, 'pending'), eq(jobQueue.status, 'processing'))
  );
}

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
export function mapRowToJob(row: JobQueueRow): Job {
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

export function assertValidJobTypes(
  values: readonly unknown[]
): asserts values is JobType[] {
  const allValid = values.every(
    (v) => typeof v === 'string' && ALLOWED_JOB_TYPES.has(v as JobType)
  );
  if (!allValid) {
    throw new Error('Invalid job type(s) received');
  }
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
export function appendErrorHistoryEntry(
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
