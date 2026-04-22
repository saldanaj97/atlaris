/**
 * Job queue queries: enqueue, claim, complete, fail, stats, cleanup, and lookups by plan/user.
 * Uses optional dbClient for DI; defaults to getDb() for request-scoped RLS.
 */

export {
	cleanupOldJobs,
	countUserJobsSince,
	getActiveRegenerationJob,
	getFailedJobs,
	getJobStats,
} from '@/lib/db/queries/jobs/monitoring';
export {
	claimNextPendingJob,
	completeJobRecord,
	failJobRecord,
	insertJobRecord,
} from '@/lib/db/queries/jobs/mutations';
