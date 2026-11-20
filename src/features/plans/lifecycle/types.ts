/**
 * Types for the plan lifecycle module.
 *
 * These types define the contracts between the lifecycle service and its ports,
 * as well as the discriminated union result types for lifecycle operations.
 */

import type {
  AttemptReservation,
  AttemptWorkflowMetadata,
  ReserveAttemptSlotParams,
} from '@/lib/db/queries/types/attempts.types';
import type {
  GenerationInput,
  PlanGenerationCoreFields,
  PlanGenerationCoreFieldsNormalized,
  ProviderMetadata,
} from '@/shared/types/ai-provider.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';
import type { FailureClassification } from '@/shared/types/failure-classification.types';
import type { GenerationPurpose } from '@/shared/types/generation-purpose';

export type CreateAiPlanInput = {
  readonly userId: string;
} & Readonly<PlanGenerationCoreFields>;

export type PlanInsertData = Readonly<PlanGenerationCoreFields> & {
  readonly visibility: 'private';
  readonly origin: 'ai';
};

export type AtomicInsertResult =
  | { readonly status: 'created'; readonly id: string }
  | { readonly status: 'duplicate'; readonly existingPlanId: string }
  | {
      readonly status: 'limit_reached';
      readonly currentCount: number;
      readonly limit: number;
    }
  | { readonly status: 'subscription_required' };

export type DurationCapResult = {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly upgradeUrl?: string;
};

export type NormalizedDuration = {
  readonly startDate: string | null;
  readonly deadlineDate: string | null;
  readonly totalWeeks: number;
};

export type CreatePlanSuccess = {
  readonly status: 'success';
  readonly planId: string;
  readonly tier: SubscriptionTier;
  readonly normalizedInput: Readonly<PlanGenerationCoreFieldsNormalized>;
};

export type RetryableFailure = {
  readonly status: 'retryable_failure';
  readonly classification: FailureClassification | 'unknown';
  readonly error: Error;
};

export type PermanentFailure = {
  readonly status: 'permanent_failure';
  readonly classification: FailureClassification | 'unknown';
  readonly error: Error;
};

export type QuotaRejection = {
  readonly status: 'quota_rejected';
  readonly reason: string;
  readonly upgradeUrl?: string;
};

export type DurationExceeded = {
  readonly status: 'duration_exceeded';
  readonly reason: string;
  readonly upgradeUrl?: string;
};

export type SubscriptionRequired = {
  readonly status: 'subscription_required';
  readonly reason: string;
  readonly upgradeUrl: string;
};

export type AttemptCapExceeded = {
  readonly status: 'attempt_cap_exceeded';
  readonly reason: string;
  readonly cappedPlanId: string;
};

export type DuplicateDetected = {
  readonly status: 'duplicate_detected';
  readonly existingPlanId: string;
};

export type CreatePlanResult =
  | CreatePlanSuccess
  | RetryableFailure
  | PermanentFailure
  | QuotaRejection
  | DurationExceeded
  | SubscriptionRequired
  | AttemptCapExceeded
  | DuplicateDetected;

export type GeneratedTask = {
  readonly title: string;
  readonly description?: string;
  readonly estimatedMinutes: number;
};

export type GeneratedModule = {
  readonly title: string;
  readonly description?: string;
  readonly estimatedMinutes: number;
  readonly tasks: GeneratedTask[];
};

export type ProcessGenerationInput = {
  readonly planId: string;
  readonly userId: string;
  readonly tier: SubscriptionTier;
  readonly input: Readonly<GenerationInput>;
  readonly generationPurpose: GenerationPurpose;
  readonly modelOverride?: string;
  readonly groundedWriterModelId?: string | null;
  readonly signal?: AbortSignal;
  readonly allowedGenerationStatuses?: ReserveAttemptSlotParams['allowedGenerationStatuses'];
  readonly requiredGenerationStatus?: ReserveAttemptSlotParams['requiredGenerationStatus'];
  readonly onAttemptReserved?: (
    reservation: AttemptReservation,
  ) => void | Promise<void>;
  readonly workflowMetadata?: AttemptWorkflowMetadata;
};

export type GenerationSuccessData = {
  readonly modules: GeneratedModule[];
  readonly metadata: ProviderMetadata;
  readonly durationMs: number;
};

export type GenerationSuccess = {
  readonly status: 'generation_success';
  readonly data: GenerationSuccessData;
};

export type AlreadyFinalized = {
  readonly status: 'already_finalized';
  readonly planId: string;
};

export type GenerationAttemptResult =
  | GenerationSuccess
  | RetryableFailure
  | PermanentFailure
  | AlreadyFinalized;
