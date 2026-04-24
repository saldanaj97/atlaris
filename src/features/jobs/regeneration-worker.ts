import {
	type ProcessPlanRegenerationJobResult,
	processNextPlanRegenerationJob,
} from '@/features/plans/regeneration-orchestration';
import { assertNever } from '@/lib/errors';

export {
	_resetInlineDrainStateForTesting,
	isInlineDrainFree,
	registerInlineDrain,
	tryRegisterInlineDrain,
	waitForInlineRegenerationDrains,
} from '@/features/jobs/regeneration-inline-drain';

type ProcessRegenerationJobResult = {
	processed: boolean;
	jobId?: string;
	status?: 'completed' | 'failed';
	/** True when the plan was already finalized (idempotent success); both map to `status: 'completed'`. */
	wasAlreadyFinalized?: boolean;
	reason?: string;
};

function mapBoundaryResultToDrain(
	result: ProcessPlanRegenerationJobResult,
): ProcessRegenerationJobResult {
	switch (result.kind) {
		case 'no-job':
			return { processed: false };
		// `completed` and `already-finalized` both end the job successfully; split here only if metrics need to differ.
		case 'completed':
			return {
				processed: true,
				jobId: result.jobId,
				status: 'completed',
				wasAlreadyFinalized: false,
			};
		case 'already-finalized':
			return {
				processed: true,
				jobId: result.jobId,
				status: 'completed',
				wasAlreadyFinalized: true,
			};
		case 'retryable-failure':
		case 'permanent-failure':
		case 'plan-not-found-or-unauthorized':
		case 'invalid-payload':
			return {
				processed: true,
				jobId: result.jobId,
				status: 'failed',
			};
		default:
			assertNever(result);
	}
}

async function defaultProcessNextRegenerationJob(): Promise<ProcessRegenerationJobResult> {
	const result = await processNextPlanRegenerationJob();
	return mapBoundaryResultToDrain(result);
}

type DrainRegenerationQueueResult = {
	processedCount: number;
	completedCount: number;
	failedCount: number;
};

type DrainRegenerationQueueOptions = {
	maxJobs?: number;
	processNextJob?: () => Promise<ProcessRegenerationJobResult>;
};

export async function drainRegenerationQueue(
	options?: DrainRegenerationQueueOptions,
): Promise<DrainRegenerationQueueResult> {
	const maxJobs = Math.max(0, options?.maxJobs ?? 1);
	const processNextJob =
		options?.processNextJob ?? defaultProcessNextRegenerationJob;

	let processedCount = 0;
	let completedCount = 0;
	let failedCount = 0;

	for (let i = 0; i < maxJobs; i += 1) {
		const result = await processNextJob();

		if (!result.processed) {
			break;
		}

		processedCount += 1;
		if (result.status === 'completed') {
			completedCount += 1;
		}
		if (result.status === 'failed') {
			failedCount += 1;
		}
	}

	return {
		processedCount,
		completedCount,
		failedCount,
	};
}
