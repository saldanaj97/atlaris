import type { SubscriptionTier } from '@/shared/types/billing.types';
import type { GenerationPurpose } from '@/shared/types/generation-purpose';

export type FreeInitialAdmissionDecision =
  | 'ok'
  | 'free_allowance_used'
  | 'free_initial_in_progress';

export function evaluateFreeInitialAdmission(params: {
  tier: SubscriptionTier;
  generationPurpose: GenerationPurpose;
  initialPlanGeneratedAt: Date | null;
  inProgressInitialCount: number;
}): FreeInitialAdmissionDecision {
  if (params.tier !== 'free' || params.generationPurpose !== 'initial') {
    return 'ok';
  }
  if (params.initialPlanGeneratedAt != null) {
    return 'free_allowance_used';
  }
  if (params.inProgressInitialCount > 0) {
    return 'free_initial_in_progress';
  }
  return 'ok';
}
