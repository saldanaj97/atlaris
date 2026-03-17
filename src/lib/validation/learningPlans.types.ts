import type { infer as ZodInfer } from 'zod';

type LearningPlansModule = typeof import('./learningPlans');

export type PlanRegenerationOverridesInput = ZodInfer<
  LearningPlansModule['planRegenerationOverridesSchema']
>;

export type CreateLearningPlanInput = ZodInfer<
  LearningPlansModule['createLearningPlanSchema']
>;

export type OnboardingFormValues = ZodInfer<
  LearningPlansModule['onboardingFormSchema']
>;
