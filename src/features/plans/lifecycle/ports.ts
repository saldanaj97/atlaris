import type {
  AttemptRejection,
  AttemptReservation,
  GenerationAttemptRecord,
  ReserveAttemptSlotParams,
} from '@/lib/db/queries/types/attempts.types';
import type { GenerationInput } from '@/shared/types/ai-provider.types';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';
import type { FailureClassification } from '@/shared/types/failure-classification.types';
import type {
  FinalizeGenerationFailureParams,
  FinalizeGenerationSuccessInput,
} from './generation-finalization/types';
import type {
  AtomicInsertResult,
  DurationCapResult,
  GeneratedModule,
  NormalizedDuration,
  PlanInsertData,
} from './types';

/**
 * Port interfaces for the plan lifecycle module (persistence, quota, AI, billing hooks).
 */

export interface PlanPersistencePort {
  /** Atomically enforce plan limit and insert inside one transaction. */
  atomicInsertPlan(
    this: void,
    userId: string,
    planData: PlanInsertData,
  ): Promise<AtomicInsertResult>;

  /** Find a plan that has exhausted generation attempts (capped without modules). */
  findCappedPlanWithoutModules(
    this: void,
    userId: string,
  ): Promise<string | null>;

  /** Find a recent duplicate plan with the same normalized topic (dedup window). */
  findRecentDuplicatePlan(
    this: void,
    userId: string,
    normalizedTopic: string,
  ): Promise<string | null>;

  markGenerationSuccess(this: void, planId: string): Promise<void>;
  markGenerationFailure(this: void, planId: string): Promise<void>;
}

/** Persistence slice for marking generation success/failure only (e.g. error paths without full finalization). */
export type PlanGenerationStatusPort = Pick<
  PlanPersistencePort,
  'markGenerationSuccess' | 'markGenerationFailure'
>;

/**
 * Port interfaces for the plan lifecycle module (quota, billing hooks).
 */

export interface QuotaPort {
  resolveUserTier(this: void, userId: string): Promise<SubscriptionTier>;

  checkDurationCap(
    this: void,
    params: {
      tier: SubscriptionTier;
      weeklyHours: number;
      totalWeeks: number;
    },
  ): DurationCapResult;

  normalizePlanDuration(
    this: void,
    params: {
      tier: SubscriptionTier;
      weeklyHours: number;
      startDate?: string | null;
      deadlineDate?: string | null;
      today?: Date;
    },
  ): NormalizedDuration;
}

/**
 * Port interfaces for the plan lifecycle module (generation, AI hooks).
 */

export type GenerationRunParams = {
  planId: string;
  userId: string;
  tier: SubscriptionTier;
  input: Readonly<GenerationInput>;
  modelOverride?: string | null;
  signal?: AbortSignal;
  allowedGenerationStatuses?: ReserveAttemptSlotParams['allowedGenerationStatuses'];
  requiredGenerationStatus?: ReserveAttemptSlotParams['requiredGenerationStatus'];
  onAttemptReserved?: (reservation: AttemptReservation) => void;
};

type GenerationRunSuccess = {
  status: 'success';
  modules: GeneratedModule[];
  metadata: Record<string, unknown>;
  usage: CanonicalAIUsage;
  durationMs: number;
  reservation: AttemptReservation;
  extendedTimeout: boolean;
};

type GenerationRunFailure = {
  status: 'failure';
  classification: FailureClassification;
  error: Error;
  metadata?: Record<string, unknown>;
  usage?: CanonicalAIUsage;
  durationMs: number;
  reservation?: AttemptReservation;
  timedOut?: boolean;
  extendedTimeout?: boolean;
  reservationRejectionReason?: AttemptRejection['reason'];
};

export type GenerationRunResult = GenerationRunSuccess | GenerationRunFailure;

export interface GenerationPort {
  runGeneration(
    this: void,
    params: GenerationRunParams,
  ): Promise<GenerationRunResult>;
}

/**
 * Port interfaces for the plan lifecycle module (generation finalization, billing hooks).
 */

/** Full finalization in one transaction; use {@link PlanGenerationStatusPort} when only plan status must update. */
export interface GenerationFinalizationPort {
  finalizeSuccess(
    this: void,
    input: FinalizeGenerationSuccessInput,
  ): Promise<GenerationAttemptRecord>;

  finalizeFailure(
    this: void,
    input: FinalizeGenerationFailureParams,
  ): Promise<GenerationAttemptRecord | void>;
}

/**
 * Port interfaces for the plan lifecycle module (usage recording, billing hooks).
 */

export interface UsageRecordingPort {
  recordUsage(
    this: void,
    params: {
      userId: string;
      usage: CanonicalAIUsage;
      kind?: 'plan' | 'regeneration';
    },
  ): Promise<void>;
}
