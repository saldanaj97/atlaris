import {
  claimNextPendingJob,
  completeJobRecord,
  countUserJobsSince,
  failJobRecord,
  findJobsByPlan,
  insertJobRecord,
} from '@/lib/db/queries/jobs';
import type { JobEnqueueResult } from '@/lib/db/queries/types/jobs.types';
import { db } from '@/lib/db/service-role';
import type { Job, JobPayload, JobResult, JobType } from '@/lib/jobs/types';

export interface FailJobOptions {
  retryable?: boolean;
}

export async function enqueueJob(
  type: JobType,
  planId: string | null,
  userId: string,
  data: JobPayload,
  priority = 0
): Promise<string> {
  const result = await enqueueJobWithResult(
    type,
    planId,
    userId,
    data,
    priority
  );
  return result.id;
}

export async function enqueueJobWithResult(
  type: JobType,
  planId: string | null,
  userId: string,
  data: JobPayload,
  priority = 0
): Promise<JobEnqueueResult> {
  return insertJobRecord({ type, planId, userId, data, priority }, db);
}

export async function getNextJob(types: JobType[]): Promise<Job | null> {
  return claimNextPendingJob(types, db);
}

export async function completeJob(
  jobId: string,
  result: JobResult
): Promise<Job | null> {
  return completeJobRecord(jobId, result, db);
}

export async function failJob(
  jobId: string,
  error: string,
  options: FailJobOptions = {}
): Promise<Job | null> {
  return failJobRecord(jobId, error, options.retryable, db);
}

export async function getJobsByPlanId(
  planId: string,
  limit?: number
): Promise<Job[]> {
  return findJobsByPlan(planId, db, limit);
}

export async function getUserJobCount(
  userId: string,
  type: JobType,
  since: Date
): Promise<number> {
  return countUserJobsSince(userId, type, since, db);
}
