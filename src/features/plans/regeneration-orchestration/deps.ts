import { runRegenerationQuotaReserved } from '@/features/billing/regeneration-quota-boundary';
import { resolveUserTier } from '@/features/billing/tier';
import { computeJobPriority, isPriorityTopic } from '@/features/jobs/priority';
import {
	completeJob,
	enqueueJobWithResult,
	failJob,
	getNextJob,
} from '@/features/jobs/queue';
import { tryRegisterInlineDrain } from '@/features/jobs/regeneration-inline-drain';
import {
	createPlanLifecycleService,
	type JobQueuePort,
	type PlanLifecycleService,
} from '@/features/plans/lifecycle';
import { shouldRetryJob } from '@/features/plans/retry-policy';
import type { PlanGenerationRateLimitResult } from '@/lib/api/rate-limit';
import { checkPlanGenerationRateLimit } from '@/lib/api/rate-limit';
import { regenerationQueueEnv } from '@/lib/config/env';
import { selectOwnedPlanById } from '@/lib/db/queries/helpers/plans-helpers';
import { getActiveRegenerationJob } from '@/lib/db/queries/jobs';
import type { DbClient } from '@/lib/db/types';
import { logger } from '@/lib/logging/logger';

import type { RegenerationOwnedPlan } from './types';

// Regeneration orchestration owns enqueue/complete/fail via deps.queue and process/request;
// lifecycle processGenerationAttempt must not hit queue I/O here. If it does, fail loudly.
function createNoOpJobQueueMethod(method: keyof JobQueuePort) {
	return () => {
		throw new Error(
			`Unexpected JobQueuePort.${method} call in regeneration lifecycle setup`,
		);
	};
}

const noOpJobQueue: JobQueuePort = {
	enqueueJob: createNoOpJobQueueMethod('enqueueJob'),
	completeJob: createNoOpJobQueueMethod('completeJob'),
	failJob: createNoOpJobQueueMethod('failJob'),
};

export interface RegenerationOrchestrationDeps {
	dbClient: DbClient;
	queue: {
		enabled: () => boolean;
		enqueueWithResult: typeof enqueueJobWithResult;
		getNextJob: typeof getNextJob;
		completeJob: typeof completeJob;
		failJob: typeof failJob;
	};
	quota: {
		runReserved: typeof runRegenerationQuotaReserved;
	};
	plans: {
		getActiveRegenerationJob: (
			planId: string,
			userId: string,
			dbClient: DbClient,
		) => Promise<{ id: string } | null>;
		findOwnedPlan: (
			planId: string,
			userId: string,
			dbClient: DbClient,
		) => Promise<RegenerationOwnedPlan | null>;
	};
	tier: {
		resolveUserTier: typeof resolveUserTier;
	};
	priority: {
		computeJobPriority: typeof computeJobPriority;
		isPriorityTopic: typeof isPriorityTopic;
	};
	lifecycle: {
		service: PlanLifecycleService;
	};
	retry: {
		shouldRetryJob: typeof shouldRetryJob;
	};
	inlineDrain: {
		tryRegister: typeof tryRegisterInlineDrain;
		drain: () => Promise<unknown>;
	};
	/**
	 * Invoked after active-job dedupe passes and before quota reserve + enqueue.
	 * Must match {@link checkPlanGenerationRateLimit} semantics (throws RateLimitError when exceeded).
	 */
	rateLimit: {
		check: (
			userId: string,
			dbClient: DbClient,
		) => Promise<PlanGenerationRateLimitResult>;
	};
	logger: Pick<typeof logger, 'info' | 'error' | 'warn'>;
}

export type DefaultRegenerationOrchestrationDepsOptions = {
	inlineDrain?: () => Promise<unknown>;
};

async function drainSingleRegenerationJob(): Promise<unknown> {
	const { drainRegenerationQueue } = await import(
		'@/features/jobs/regeneration-worker'
	);
	return drainRegenerationQueue({ maxJobs: 1 });
}

export function createDefaultRegenerationOrchestrationDeps(
	dbClient: DbClient,
	options: DefaultRegenerationOrchestrationDepsOptions = {},
): RegenerationOrchestrationDeps {
	return {
		dbClient,
		queue: {
			enabled: () => regenerationQueueEnv.enabled,
			enqueueWithResult: enqueueJobWithResult,
			getNextJob,
			completeJob,
			failJob,
		},
		quota: { runReserved: runRegenerationQuotaReserved },
		plans: {
			getActiveRegenerationJob,
			findOwnedPlan: async (planId, userId, client) => {
				const row = await selectOwnedPlanById({
					planId,
					ownerUserId: userId,
					dbClient: client,
				});
				return row;
			},
		},
		tier: { resolveUserTier },
		priority: { computeJobPriority, isPriorityTopic },
		lifecycle: {
			service: createPlanLifecycleService({
				dbClient,
				jobQueue: noOpJobQueue,
			}),
		},
		retry: { shouldRetryJob },
		inlineDrain: {
			tryRegister: tryRegisterInlineDrain,
			drain: options.inlineDrain ?? drainSingleRegenerationJob,
		},
		rateLimit: { check: checkPlanGenerationRateLimit },
		logger,
	};
}
