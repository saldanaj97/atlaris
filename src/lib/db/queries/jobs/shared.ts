import { eq } from 'drizzle-orm';
import { mapRowToJob } from '@/lib/db/queries/helpers/jobs-helpers';
import type {
  JobQueueRow,
  JobsDbClient,
} from '@/lib/db/queries/types/jobs.types';
import { jobQueue } from '@/lib/db/schema';
import type { Job } from '@/shared/types/jobs.types';

export const jobQueueSelect = {
  id: jobQueue.id,
  planId: jobQueue.planId,
  userId: jobQueue.userId,
  jobType: jobQueue.jobType,
  status: jobQueue.status,
  priority: jobQueue.priority,
  attempts: jobQueue.attempts,
  maxAttempts: jobQueue.maxAttempts,
  payload: jobQueue.payload,
  result: jobQueue.result,
  error: jobQueue.error,
  scheduledFor: jobQueue.scheduledFor,
  startedAt: jobQueue.startedAt,
  completedAt: jobQueue.completedAt,
  createdAt: jobQueue.createdAt,
  updatedAt: jobQueue.updatedAt,
} as const;

/** Transaction client type for use inside dbClient.transaction() callbacks. */
type JobsTransaction = Parameters<
  Parameters<JobsDbClient['transaction']>[0]
>[0];

/**
 * Locks the job row by id (SELECT FOR UPDATE) and indicates whether it is already terminal.
 * Shared by completeJobRecord and failJobRecord for idempotent guard behavior.
 *
 * @returns null if job not found, else { row, isTerminal } with isTerminal true when status is completed or failed
 */
async function lockJobAndCheckTerminal(
  tx: JobsTransaction,
  jobId: string,
): Promise<{ row: JobQueueRow; isTerminal: boolean } | null> {
  const [row] = await tx
    .select(jobQueueSelect)
    .from(jobQueue)
    .where(eq(jobQueue.id, jobId))
    .for('update');

  if (!row) {
    return null;
  }

  const isTerminal = row.status === 'completed' || row.status === 'failed';
  return { row, isTerminal };
}

export async function runJobMutationIfEditable(
  client: JobsDbClient,
  jobId: string,
  mutate: (tx: JobsTransaction, row: JobQueueRow) => Promise<Job | null>,
): Promise<Job | null> {
  return client.transaction(async (tx) => {
    const locked = await lockJobAndCheckTerminal(tx, jobId);
    if (!locked) {
      return null;
    }
    if (locked.isTerminal) {
      return mapRowToJob(locked.row);
    }
    return mutate(tx, locked.row);
  });
}

type MutationCountResult = {
  count?: unknown;
  rowCount?: unknown;
};

export function normalizeMutationCount(result: unknown): number {
  if (!result || typeof result !== 'object') {
    return 0;
  }

  const mutationResult = result as MutationCountResult;
  const candidate = mutationResult.count;
  if (typeof candidate === 'number' && Number.isFinite(candidate)) {
    return Math.max(0, Math.trunc(candidate));
  }

  const rowCount = mutationResult.rowCount;
  if (typeof rowCount === 'number' && Number.isFinite(rowCount)) {
    return Math.max(0, Math.trunc(rowCount));
  }

  return 0;
}
