import type { Job } from '@/features/jobs/types';

import { claimRegenerationJob, loadJobById } from '@/features/jobs/queue';

/**
 * Claims a pending regeneration job by id, the way the worker does, keeping
 * the payload currently stored on the row. Returns null when it is not claimable.
 */
export async function claimPendingRegenerationJob(
  jobId: string,
): Promise<Job | null> {
  const job = await loadJobById(jobId);
  if (!job?.planId) {
    return null;
  }

  return claimRegenerationJob(
    jobId,
    { planId: job.planId, userId: job.userId },
    job.data,
  );
}
