/**
 * Types for the plan lifecycle module.
 *
 * These types define the contracts between the lifecycle service and its ports,
 * as well as the discriminated union result types for lifecycle operations.
 */

import type {
	GenerationInput,
	PlanGenerationCoreFields,
	PlanGenerationCoreFieldsNormalized,
} from '@/shared/types/ai-provider.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';
import type { FailureClassification } from '@/shared/types/failure-classification.types';

// Re-export commonly used types so the service can import from one place
export type { SubscriptionTier } from '@/shared/types/billing.types';
export { isRetryableClassification } from '@/shared/types/failure-classification';
export type { FailureClassification } from '@/shared/types/failure-classification.types';

/** Input for creating an AI-origin learning plan. */
export type CreateAiPlanInput = {
	readonly userId: string;
} & Readonly<PlanGenerationCoreFields>;

/** Data passed to the persistence port for atomic plan insertion. */
export type PlanInsertData = Readonly<PlanGenerationCoreFields> & {
	readonly visibility: 'private';
	readonly origin: 'ai';
};

// ─── Port result types ───────────────────────────────────────────

/** Result of an atomic plan insert operation. */
export type AtomicInsertResult =
	| { readonly success: true; readonly id: string }
	| { readonly success: false; readonly reason: string };

/** Result of a duration cap check. */
export type DurationCapResult = {
	readonly allowed: boolean;
	readonly reason?: string;
	readonly upgradeUrl?: string;
};

/** Normalized plan duration after tier-based adjustments. */
export type NormalizedDuration = {
	readonly startDate: string | null;
	readonly deadlineDate: string | null;
	readonly totalWeeks: number;
};

// ─── Lifecycle result types (discriminated union) ────────────────

/** Plan was successfully created. */
export type CreatePlanSuccess = {
	readonly status: 'success';
	readonly planId: string;
	readonly tier: SubscriptionTier;
	/** Normalized values produced during creation — used by the route for generation input. */
	readonly normalizedInput: Readonly<PlanGenerationCoreFieldsNormalized>;
};

/** A retryable failure occurred (e.g. provider error, timeout). */
export type RetryableFailure = {
	readonly status: 'retryable_failure';
	readonly classification: FailureClassification | 'unknown';
	readonly error: Error;
};

/** A permanent failure occurred (e.g. validation error). */
export type PermanentFailure = {
	readonly status: 'permanent_failure';
	readonly classification: FailureClassification | 'unknown';
	readonly error: Error;
};

/** The operation was rejected due to quota/limit constraints. */
export type QuotaRejection = {
	readonly status: 'quota_rejected';
	readonly reason: string;
	readonly upgradeUrl?: string;
};

/** User has an existing plan that exhausted generation attempts (attempt cap). */
export type AttemptCapExceeded = {
	readonly status: 'attempt_cap_exceeded';
	readonly reason: string;
	readonly cappedPlanId: string;
};

/** A duplicate plan was detected (idempotent return). */
export type DuplicateDetected = {
	readonly status: 'duplicate_detected';
	readonly existingPlanId: string;
};

/**
 * Discriminated union of all possible outcomes from plan creation.
 * The service never throws for these expected lifecycle outcomes.
 */
export type CreatePlanResult =
	| CreatePlanSuccess
	| RetryableFailure
	| PermanentFailure
	| QuotaRejection
	| AttemptCapExceeded
	| DuplicateDetected;

// ─── Generated module types ──────────────────────────────────────

/** A single task within a generated module. */
export type GeneratedTask = {
	readonly title: string;
	readonly description?: string;
	readonly estimatedMinutes: number;
};

/** A module produced by AI plan generation. */
export type GeneratedModule = {
	readonly title: string;
	readonly description?: string;
	readonly estimatedMinutes: number;
	readonly tasks: GeneratedTask[];
};

// ─── Generation attempt types ────────────────────────────────────

/** Input for processing a generation attempt on an existing plan. */
export type ProcessGenerationInput = {
	readonly planId: string;
	readonly userId: string;
	readonly tier: SubscriptionTier;
	readonly input: Readonly<GenerationInput>;
	readonly modelOverride?: string | null;
	readonly signal?: AbortSignal;
};

/** Data returned on a successful generation. */
export type GenerationSuccessData = {
	readonly modules: GeneratedModule[];
	readonly metadata: Record<string, unknown>;
	readonly durationMs: number;
};

/** Generation succeeded — plan marked ready, usage recorded. */
export type GenerationSuccess = {
	readonly status: 'generation_success';
	readonly data: GenerationSuccessData;
};

/** The plan was already finalized — idempotent no-op. */
export type AlreadyFinalized = {
	readonly status: 'already_finalized';
	readonly planId: string;
};

/**
 * Discriminated union of all possible outcomes from a generation attempt.
 * The service never throws for these expected lifecycle outcomes.
 */
export type GenerationAttemptResult =
	| GenerationSuccess
	| RetryableFailure
	| PermanentFailure
	| AlreadyFinalized;
