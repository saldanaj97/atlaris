import type { PlanRegenerationOverridesInput } from '@/features/plans/validation/learningPlans.types';
import type { LearningStyle, SkillLevel } from '@/shared/types/db.types';

export type PlanRegenerationOverrides = PlanRegenerationOverridesInput;

/** Owned plan row fields required for regeneration orchestration (no Drizzle exports). */
export type RegenerationOwnedPlan = {
	id: string;
	userId: string;
	topic: string;
	skillLevel: SkillLevel;
	weeklyHours: number;
	learningStyle: LearningStyle;
	startDate: string | null;
	deadlineDate: string | null;
};

export type RequestPlanRegenerationArgs = {
	userId: string;
	planId: string;
	overrides?: PlanRegenerationOverrides;
	/** Set by the route. When true the boundary may schedule an inline drain on successful enqueue. */
	inlineProcessingEnabled: boolean;
};

export type PlanGenerationRateLimitSnapshot = {
	remaining: number;
	limit: number;
	/** Unix timestamp in whole seconds since epoch (UTC), not milliseconds. Matches `X-RateLimit-Reset` emitted for this snapshot. */
	reset: number;
};

export type RequestPlanRegenerationResult =
	| { kind: 'queue-disabled' }
	| {
			kind: 'enqueued';
			jobId: string;
			planId: string;
			status: 'pending';
			/** True if the boundary scheduled an inline drain. Route uses this only for response headers/telemetry; drain is already scheduled. */
			inlineDrainScheduled: boolean;
			planGenerationRateLimit: PlanGenerationRateLimitSnapshot;
	  }
	| { kind: 'plan-not-found' }
	| { kind: 'active-job-conflict'; existingJobId: string }
	| {
			kind: 'queue-dedupe-conflict';
			existingJobId: string;
			reconciliationRequired?: boolean;
	  }
	| {
			kind: 'quota-denied';
			currentCount: number;
			limit: number;
			reason: string;
	  };

export type ProcessPlanRegenerationJobResult =
	| { kind: 'no-job' }
	| { kind: 'completed'; jobId: string; planId: string }
	| {
			kind: 'retryable-failure';
			jobId: string;
			planId: string;
			willRetry: boolean;
	  }
	| { kind: 'permanent-failure'; jobId: string; planId?: string }
	| { kind: 'already-finalized'; jobId: string; planId: string }
	/**
	 * Single variant on purpose: separate "not found" vs "unauthorized" would let callers
	 * infer whether a plan id exists. Keep this combined; do not split the union.
	 */
	| { kind: 'plan-not-found-or-unauthorized'; jobId: string; planId: string }
	| { kind: 'invalid-payload'; jobId: string };

export type { Job } from '@/features/jobs/types';
