import type {
  LearningPlan,
  ProgressStatus,
  TaskProgress,
} from '@/lib/types/db';
import { CreateLearningPlanInput } from '@/lib/validation/learningPlans';

interface ErrorResponse {
  error?: string | null;
  message?: string | null;
  code?: string | null;
}

interface JsonResponse<TData> {
  data: TData;
  meta?: Record<string, unknown> | null;
}

type CreatePlanSuccessResponse = JsonResponse<LearningPlan>;

type UpdateTaskProgressSuccessResponse = JsonResponse<{
  taskProgress: TaskProgress;
  totals?: { totalTasks: number; completedTasks: number };
}>;

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
): Promise<LearningPlan> {
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
      console.error('Failed to parse createPlan error response', error);
    }
    throw new Error(message);
  }

  const payload = (await response.json()) as CreatePlanSuccessResponse;
  return payload.data;
}

export async function updateTaskProgress(
  planId: string,
  taskId: string,
  status: ProgressStatus
) {
  const response = await fetch(
    `/api/v1/plans/${planId}/tasks/${taskId}/progress`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    }
  );

  if (!response.ok) {
    let message = 'Unable to update task progress.';
    try {
      const errorBody =
        (await response.json()) as Partial<ErrorResponse> | null;
      message = extractErrorMessage(errorBody, message);
    } catch (error) {
      console.error('Failed to parse updateTaskProgress error', error);
    }
    throw new Error(message);
  }

  const payload = (await response.json()) as UpdateTaskProgressSuccessResponse;
  return payload.data;
}
