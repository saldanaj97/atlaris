import type { InferSelectModel } from 'drizzle-orm';
import type { DbClient } from '@/lib/db/types';
import type { JobErrorHistoryEntry } from '@/shared/types/jobs.types';

type DbSchemaModule = typeof import('@/lib/db/schema');

/**
 * Database row type inferred from Drizzle schema.
 * Using InferSelectModel ensures type safety without manual interface maintenance.
 */
export type JobQueueRow = InferSelectModel<DbSchemaModule['jobQueue']>;

export type JobsDbClient = DbClient;

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
