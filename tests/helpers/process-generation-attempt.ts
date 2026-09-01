import type { ProcessGenerationInput } from '@/features/plans/lifecycle/types';
import type { DbClient } from '@/lib/db/types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import { createPlanLifecycleService } from '@/features/plans/lifecycle/factory';
import { db } from '@supabase/service-role';

export function processTestGenerationAttempt(
  input: ProcessGenerationInput,
  dbClient: DbClient = db,
) {
  return createPlanLifecycleService({ dbClient }).processGenerationAttempt(
    input,
  );
}

export function buildTestProcessGenerationInput(params: {
  planId: string;
  userId: string;
  topic: string;
  skillLevel?: ProcessGenerationInput['input']['skillLevel'];
  weeklyHours?: number;
  learningStyle?: ProcessGenerationInput['input']['learningStyle'];
  notes?: string | null;
  tier?: SubscriptionTier;
}): ProcessGenerationInput {
  return {
    planId: params.planId,
    userId: params.userId,
    tier: params.tier ?? 'free',
    generationPurpose: 'initial',
    input: {
      topic: params.topic,
      skillLevel: params.skillLevel ?? 'beginner',
      weeklyHours: params.weeklyHours ?? 5,
      learningStyle: params.learningStyle ?? 'mixed',
      ...(params.notes !== undefined ? { notes: params.notes } : {}),
    },
  };
}
