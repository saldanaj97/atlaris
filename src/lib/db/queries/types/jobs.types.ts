import type { getDb } from '@/lib/db/runtime';
import { jobQueue } from '@/lib/db/schema';
import type { JobErrorHistoryEntry } from '@/lib/jobs/types';
import type { InferSelectModel } from 'drizzle-orm';

/**
 * Database row type inferred from Drizzle schema.
 * Using InferSelectModel ensures type safety without manual interface maintenance.
 */
export type JobQueueRow = InferSelectModel<typeof jobQueue>;

export type JobsDbClient = ReturnType<typeof getDb>;

export interface JobEnqueueResult {
  id: string;
  deduplicated: boolean;
}

export interface JobStats {
  pendingCount: number;
  processingCount: number;
  completedCount: number;
  failedCount: number;
  averageProcessingTimeMs: number | null;
  failureRate: number;
}

export type ErrorHistoryEntry = JobErrorHistoryEntry;
