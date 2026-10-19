import type { JobsDbClient } from '@/lib/db/queries/types/jobs.types';
import type { Job } from '@/shared/types/jobs.types';

import { jobQueueSelect } from './shared';
import {
  activeRegenerationJobWhere,
  mapRowToJob,
} from '@/lib/db/queries/helpers/jobs-helpers';
import { jobQueue } from '@supabase/schema';
import { desc, eq } from 'drizzle-orm';

/**
 * Loads a job row by id.
 */
export async function getJobById(
  jobId: string,
  dbClient: JobsDbClient,
): Promise<Job | null> {
  const client = dbClient;

  const [row] = await client
    .select(jobQueueSelect)
    .from(jobQueue)
    .where(eq(jobQueue.id, jobId));

  return row ? mapRowToJob(row) : null;
}

/**
 * Returns the single active (pending or processing) regeneration job for a plan and user, if any.
 */
export async function getActiveRegenerationJob(
  planId: string,
  userId: string,
  dbClient: JobsDbClient,
): Promise<{ id: string } | null> {
  const client = dbClient;

  const [activeJob] = await client
    .select({ id: jobQueue.id })
    .from(jobQueue)
    .where(activeRegenerationJobWhere(planId, userId))
    .orderBy(desc(jobQueue.createdAt))
    .limit(1);

  return activeJob ?? null;
}
