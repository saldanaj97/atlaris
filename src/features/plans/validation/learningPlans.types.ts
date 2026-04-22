import type { infer as ZodInfer } from 'zod';
import type { createLearningPlanSchema } from '@/shared/schemas/learning-plans.schemas';
import type {
	onboardingFormObject,
	planRegenerationOverridesSchema,
} from './learningPlans.schemas';

export type PlanRegenerationOverridesInput = ZodInfer<
	typeof planRegenerationOverridesSchema
>;

export type CreateLearningPlanInput = ZodInfer<typeof createLearningPlanSchema>;

export type OnboardingFormValues = ZodInfer<typeof onboardingFormObject>;
