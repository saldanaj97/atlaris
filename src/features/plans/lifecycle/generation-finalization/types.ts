/**
 * Types for lifecycle generation finalization (single-transaction settlement).
 */

import type { AttemptReservation } from '@/lib/db/queries/types/attempts.types';
import type { ParsedModule } from '@/shared/types/ai-parser.types';
import type { ProviderMetadata } from '@/shared/types/ai-provider.types';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';
import type { FailureClassification } from '@/shared/types/failure-classification.types';

/**
 * Dependencies used from tests to assert transactional rollback between sub-steps.
 * Production callers omit this (empty object).
 */
export type GenerationFinalizationStoreDeps = {
  readonly afterSuccessfulAttemptPersist?: () => void | Promise<void>;
};

/** Settles success attempt + modules/tasks + plan ready + usage in one DB transaction. */
export type FinalizeGenerationSuccessInput = {
  readonly planId: string;
  readonly userId: string;
  readonly attemptId: string;
  readonly preparation: AttemptReservation;
  readonly modules: readonly ParsedModule[];
  readonly providerMetadata: Record<string, unknown>;
  readonly usage: CanonicalAIUsage;
  readonly durationMs: number;
  readonly extendedTimeout: boolean;
  /** Today only `'plan'` is used for this flow; kept for parity with prior usage recording. */
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
  readonly usage?: CanonicalAIUsage;
  readonly usageKind: 'plan';
  readonly retryable: boolean;
  readonly now?: () => Date;
};

/** Reservation rejected before an in-progress attempt row exists — plan row still marked failed. */
export type FinalizeGenerationFailurePlanOnlyInput = {
  readonly variant: 'plan_only';
  readonly planId: string;
  readonly userId: string;
  readonly classification: FailureClassification;
  readonly error: Error;
  readonly durationMs: number;
  readonly usage?: CanonicalAIUsage;
  readonly usageKind: 'plan';
  readonly retryable: boolean;
  readonly now?: () => Date;
};

export type FinalizeGenerationFailureParams =
  | FinalizeGenerationFailureWithAttemptInput
  | FinalizeGenerationFailurePlanOnlyInput;
