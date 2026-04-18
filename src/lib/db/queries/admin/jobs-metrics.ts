/**
 * Admin/monitoring queries that bypass RLS via the service-role client.
 *
 * Use these only for internal health checks and monitoring endpoints.
 * Do not import them into user-scoped request flows.
 */

import { eq, lt, sql } from 'drizzle-orm';
import { jobQueue } from '@/lib/db/schema';
import { db as serviceRoleDb } from '@/lib/db/service-role';
import { JOB_TYPES } from '@/shared/types/jobs.types';

type SystemWideJobMetrics = {
  stuckJobsCount: number;
  backlogCount: number;
  pendingRegenerationCount: number;
  stuckRegenerationCount: number;
};

export async function getSystemWideJobMetrics(
  stuckThreshold: Date,
  // Admin monitoring intentionally defaults to the service-role client.
  dbClient: typeof serviceRoleDb = serviceRoleDb
): Promise<SystemWideJobMetrics> {
  const [metrics] = await dbClient
    .select({
      stuckJobsCount: sql<number>`count(*) filter (where ${eq(jobQueue.status, 'processing')} and ${lt(jobQueue.startedAt, stuckThreshold)})::int`,
      backlogCount: sql<number>`count(*) filter (where ${eq(jobQueue.status, 'pending')})::int`,
      pendingRegenerationCount: sql<number>`count(*) filter (where ${eq(jobQueue.status, 'pending')} and ${eq(jobQueue.jobType, JOB_TYPES.PLAN_REGENERATION)})::int`,
      stuckRegenerationCount: sql<number>`count(*) filter (where ${eq(jobQueue.status, 'processing')} and ${eq(jobQueue.jobType, JOB_TYPES.PLAN_REGENERATION)} and ${lt(jobQueue.startedAt, stuckThreshold)})::int`,
    })
    .from(jobQueue);

  return {
    stuckJobsCount: metrics?.stuckJobsCount ?? 0,
    backlogCount: metrics?.backlogCount ?? 0,
    pendingRegenerationCount: metrics?.pendingRegenerationCount ?? 0,
    stuckRegenerationCount: metrics?.stuckRegenerationCount ?? 0,
  };
}
