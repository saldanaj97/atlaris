import type { EnqueueModuleLessonGenerationsDeps } from '@/features/lesson-content/progressive-enqueue';
import type {
  AttemptReservation,
  AttemptWorkflowMetadata,
} from '@/lib/db/queries/types/attempts.types';
import type { ParsedModule } from '@/shared/types/ai-parser.types';
import type { ProviderMetadata } from '@/shared/types/ai-provider.types';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';
import type { FailureClassification } from '@/shared/types/failure-classification.types';
import type { GenerationPurpose } from '@/shared/types/generation-purpose';

/**
 * Dependencies used from tests to assert transactional rollback between sub-steps.
 * Production callers omit this (empty object).
 */
export type GenerationFinalizationStoreDeps = {
  readonly afterSuccessfulAttemptPersist?: () => void | Promise<void>;
  readonly startModuleLessons?: EnqueueModuleLessonGenerationsDeps['start'];
};

export type FinalizeGenerationSuccessInput = {
  readonly planId: string;
  readonly userId: string;
  readonly attemptId: string;
  readonly preparation: AttemptReservation;
  readonly modules: readonly ParsedModule[];
  readonly providerMetadata: ProviderMetadata;
  readonly usage: CanonicalAIUsage;
  readonly durationMs: number;
  readonly extendedTimeout: boolean;
  readonly workflowMetadata?: AttemptWorkflowMetadata;
  readonly generationPurpose: GenerationPurpose;
  readonly usageKind: 'plan';
  readonly now?: () => Date;
};

export type FinalizeGenerationFailureWithAttemptInput = {
  readonly variant: 'reserved_attempt';
  readonly planId: string;
  readonly userId: string;
  readonly attemptId: string;
  readonly preparation: AttemptReservation;
  readonly classification: FailureClassification;
  readonly error: Error;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly extendedTimeout: boolean;
  readonly providerMetadata?: ProviderMetadata;
  readonly workflowMetadata?: AttemptWorkflowMetadata;
  readonly generationPurpose: GenerationPurpose;
  readonly usage?: CanonicalAIUsage;
  readonly usageKind: 'plan';
  readonly retryable: boolean;
  readonly now?: () => Date;
};

export type FinalizeGenerationFailurePlanOnlyInput = {
  readonly variant: 'plan_only';
  readonly planId: string;
  readonly userId: string;
  readonly classification: FailureClassification;
  readonly error: Error;
  readonly durationMs: number;
  readonly generationPurpose: GenerationPurpose;
  readonly usage?: CanonicalAIUsage;
  readonly usageKind: 'plan';
  readonly retryable: boolean;
  readonly now?: () => Date;
};

export type FinalizeGenerationFailureParams =
  | FinalizeGenerationFailureWithAttemptInput
  | FinalizeGenerationFailurePlanOnlyInput;
