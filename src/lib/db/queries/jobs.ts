/**
 * Job queue queries: enqueue, regeneration claim, payload updates, complete, fail, and lookups.
 * Uses optional dbClient for DI; defaults to getDb() for request-scoped RLS.
 */

export {
  getActiveRegenerationJob,
  getJobById,
} from '@/lib/db/queries/jobs/monitoring';
export {
  claimRegenerationJobById,
  completeJobRecord,
  failJobRecord,
  insertJobRecord,
  updateRegenerationJobPayload,
  updateRegenerationJobPayloadIfRunIdMissing,
} from '@/lib/db/queries/jobs/mutations';
