import type {
  Job,
  JobPayload,
  JobResult,
  JobType,
} from '@/features/job-queue/types';
import type { JobEnqueueResult } from '@/lib/db/queries/types/jobs.types';

import {
  claimRegenerationJobById,
  completeJobRecord,
  failJobRecord,
  getJobById,
  insertJobRecord,
  updateRegenerationJobPayload,
} from '@/lib/db/queries/jobs';
import { db } from '@supabase/service-role';

type FailJobOptions = {
  retryable?: boolean;
  retryAfter?: number;
};

export async function enqueueJobWithResult(
  type: JobType,
  planId: string | null,
  userId: string,
  data: JobPayload,
  priority = 0,
): Promise<JobEnqueueResult> {
  return insertJobRecord({ type, planId, userId, data, priority }, db);
}

export async function claimRegenerationJob(
  jobId: string,
  expected: { planId: string; userId: string },
  payload: JobPayload,
): Promise<Job | null> {
  return claimRegenerationJobById(jobId, expected, payload, db);
}

export async function updateJobPayload(
  jobId: string,
  payload: JobPayload,
): Promise<Job | null> {
  return updateRegenerationJobPayload(jobId, payload, db);
}

export async function completeJob(
  jobId: string,
  result: JobResult,
): Promise<Job | null> {
  return completeJobRecord(jobId, result, db);
}

export async function failJob(
  jobId: string,
  error: string,
  options: FailJobOptions = {},
): Promise<Job | null> {
  return failJobRecord(jobId, error, options.retryable, db, options.retryAfter);
}

export async function loadJobById(jobId: string): Promise<Job | null> {
  return getJobById(jobId, db);
}
