import type { RegenerationReason } from './reasons';
import type { PlanRegenerationOverridesInput } from '@/features/plans/validation/learningPlans.types';
import type { LearningStyle, SkillLevel } from '@/shared/types/db.types';

type PlanRegenerationOverrides = PlanRegenerationOverridesInput;

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
  /** Grounded regenerations only (JCS-162); dropped when the flag is off. */
  reasons?: RegenerationReason[];
  note?: string;
};

type PlanGenerationRateLimitSnapshot = {
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
    }
  | { kind: 'not-included' }
  | {
      kind: 'duration-exceeded';
      reason: string;
      upgradeUrl?: string;
    }
  | { kind: 'content-locked' };
