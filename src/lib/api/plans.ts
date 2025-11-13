import { clientLogger } from '@/lib/logging/client';
import type { PlanStatus } from '@/lib/types/client';
import type { LearningStyle, SkillLevel } from '@/lib/types/db';
import type { CreateLearningPlanInput } from '@/lib/validation/learningPlans';

interface ErrorResponse {
  error?: string | null;
  message?: string | null;
  code?: string | null;
  classification?: string | null;
}

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

function extractErrorMessage(
  body: Partial<ErrorResponse> | null | undefined,
  fallback: string
) {
  const candidates = [body?.error, body?.message, body?.code];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return fallback;
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
    let message = 'Unable to create learning plan.';
    try {
      const errorBody =
        (await response.json()) as Partial<ErrorResponse> | null;
      message = extractErrorMessage(errorBody, message);
    } catch (error) {
      clientLogger.error('Failed to parse createPlan error response', error);
    }
    throw new Error(message);
  }

  const payload = (await response.json()) as CreatePlanSuccessResponse;
  return payload;
}
