import {
  claimNextPendingJob,
  completeJobRecord,
  countUserJobsSince,
  failJobRecord,
  findJobsByPlan,
  insertJobRecord,
} from '@/lib/db/queries/jobs';
import { getDb } from '@/lib/db/runtime';
import type { Job, JobType } from './types';

export interface FailJobOptions {
  retryable?: boolean;
}

export async function enqueueJob(
  type: JobType,
  planId: string | null,
  userId: string,
  data: unknown,
  priority = 0
): Promise<string> {
  return insertJobRecord({ type, planId, userId, data, priority }, getDb());
}

export async function getNextJob(types: JobType[]): Promise<Job | null> {
  return claimNextPendingJob(types, getDb());
}

export async function completeJob(
  jobId: string,
  result: unknown
): Promise<Job | null> {
  return completeJobRecord(jobId, result, getDb());
}

export async function failJob(
  jobId: string,
  error: string,
  options: FailJobOptions = {}
): Promise<Job | null> {
  return failJobRecord(jobId, error, options, getDb());
}

export async function getJobsByPlanId(planId: string): Promise<Job[]> {
  return findJobsByPlan(planId, getDb());
}

export async function getUserJobCount(
  userId: string,
  type: JobType,
  since: Date
): Promise<number> {
  return countUserJobsSince(userId, type, since, getDb());
}
