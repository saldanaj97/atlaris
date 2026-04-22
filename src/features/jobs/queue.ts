/**
 * Queue operations for background workers.
 *
 * All functions bind the service-role DB client because queue operations
 * run in worker context without a user session. This module exists to
 * centralize that binding and prevent service-role imports from spreading
 * to multiple consumer files.
 *
 * This is intentionally a thin wrapper over db/queries/jobs.ts rather than a
 * second abstraction layer. The value here is the single service-role binding
 * point, not additional business logic.
 */
import type {
	Job,
	JobPayload,
	JobResult,
	JobType,
} from '@/features/jobs/types';
import {
	claimNextPendingJob,
	completeJobRecord,
	countUserJobsSince,
	failJobRecord,
	insertJobRecord,
} from '@/lib/db/queries/jobs';
import type { JobEnqueueResult } from '@/lib/db/queries/types/jobs.types';
import { db } from '@/lib/db/service-role';

type FailJobOptions = {
	retryable?: boolean;
};

export async function enqueueJob(
	type: JobType,
	planId: string | null,
	userId: string,
	data: JobPayload,
	priority = 0,
): Promise<string> {
	const result = await enqueueJobWithResult(
		type,
		planId,
		userId,
		data,
		priority,
	);
	return result.id;
}

export async function enqueueJobWithResult(
	type: JobType,
	planId: string | null,
	userId: string,
	data: JobPayload,
	priority = 0,
): Promise<JobEnqueueResult> {
	return insertJobRecord({ type, planId, userId, data, priority }, db);
}

export async function getNextJob(types: JobType[]): Promise<Job | null> {
	return claimNextPendingJob(types, db);
}

export async function completeJob(
	jobId: string,
	result: JobResult,
): Promise<Job | null> {
	return completeJobRecord(jobId, result, db);
}

export async function failJob(
	jobId: string,
	error: string,
	options: FailJobOptions = {},
): Promise<Job | null> {
	return failJobRecord(jobId, error, options.retryable, db);
}

export async function getUserJobCount(
	userId: string,
	type: JobType,
	since: Date,
): Promise<number> {
	return countUserJobsSince(userId, type, since, db);
}
