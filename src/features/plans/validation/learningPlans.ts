import { z } from 'zod';

export { createLearningPlanSchema } from '@/shared/schemas/learning-plans.schemas';
export { planRegenerationOverridesSchema } from './learningPlans.schemas';

import { planRegenerationOverridesSchema } from './learningPlans.schemas';
import {
  regenerationNoteSchema,
  regenerationReasonsSchema,
} from '@/features/plans/regeneration-orchestration/reasons';

export const MILLISECONDS_PER_WEEK = 7 * 24 * 3600 * 1000;
export const DEFAULT_PLAN_DURATION_WEEKS = 2;

export const planRegenerationRequestSchema = z.strictObject({
  overrides: planRegenerationOverridesSchema.optional(),
  reasons: regenerationReasonsSchema.optional(),
  note: regenerationNoteSchema.optional(),
});
