import type { GenerationInput } from '@/shared/types/ai-provider.types';

export type PlanGenerationInputFields = Pick<
  GenerationInput,
  | 'topic'
  | 'notes'
  | 'skillLevel'
  | 'weeklyHours'
  | 'learningStyle'
  | 'startDate'
  | 'deadlineDate'
>;

export function buildPlanGenerationInputFields({
  topic,
  notes,
  skillLevel,
  weeklyHours,
  learningStyle,
  startDate,
  deadlineDate,
}: PlanGenerationInputFields): GenerationInput {
  return {
    topic,
    notes,
    skillLevel,
    weeklyHours,
    learningStyle,
    startDate,
    deadlineDate,
  };
}
