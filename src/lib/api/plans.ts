import { CreateLearningPlanInput } from '@/lib/validation/learningPlans';
import type { LearningPlan, ProgressStatus } from '@/lib/types';

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
      const errorBody = await response.json();
      message =
        errorBody?.error || errorBody?.message || errorBody?.code || message;
    } catch (error) {
      console.error('Failed to parse createPlan error response', error);
    }
    throw new Error(message);
  }

  const payload = (await response.json()) as { data: LearningPlan };
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
      const errorBody = await response.json();
      message =
        errorBody?.error || errorBody?.message || errorBody?.code || message;
    } catch (error) {
      console.error('Failed to parse updateTaskProgress error', error);
    }
    throw new Error(message);
  }

  const payload = (await response.json()) as {
    data: { taskProgress: unknown; totals?: { totalTasks: number; completedTasks: number } };
  };

  return payload.data;
}
