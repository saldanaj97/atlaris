import { parseApiErrorResponse } from '@/lib/api/error-response';
import type { PlanStatus } from '@/lib/types/client';
import type { LearningStyle, SkillLevel } from '@/lib/types/db';
import type { CreateLearningPlanInput } from '@/lib/validation/learningPlans';

export interface CreatePlanSuccessResponse {
  id: string;
  topic: string;
  skillLevel: SkillLevel;
  weeklyHours: number;
  learningStyle: LearningStyle;
  visibility: CreateLearningPlanInput['visibility'];
  origin: CreateLearningPlanInput['origin'];
  createdAt?: string;
  status?: PlanStatus;
}

export async function createPlan(
  input: CreateLearningPlanInput
): Promise<CreatePlanSuccessResponse> {
  const response = await fetch('/api/v1/plans', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const fallbackMessage = 'Unable to create learning plan.';
    const parsedError = await parseApiErrorResponse(response, fallbackMessage);
    throw new Error(parsedError.error);
  }

  const payload = (await response.json()) as CreatePlanSuccessResponse;
  return payload;
}
