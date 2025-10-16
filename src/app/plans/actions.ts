'use server';

import { runGenerationAttempt } from '@/lib/ai/orchestrator';
import { getEffectiveClerkUserId } from '@/lib/api/auth';
import { getUserByClerkId } from '@/lib/db/queries/users';
import { recordUsage } from '@/lib/db/usage';
import {
  atomicCheckAndInsertPlan,
  markPlanGenerationFailure,
  markPlanGenerationSuccess,
} from '@/lib/stripe/usage';

export interface GenerateLearningPlanParams {
  topic: string;
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  learningStyle: 'reading' | 'video' | 'practice' | 'mixed';
  weeklyHours: number;
  notes?: string | null;
}

export interface GenerateLearningPlanResult {
  planId: string;
  status: 'success' | 'failure';
  error?: string;
  modulesCount?: number;
  tasksCount?: number;
}

export async function generateLearningPlan(
  params: GenerateLearningPlanParams
): Promise<GenerateLearningPlanResult> {
  const clerkUserId = await getEffectiveClerkUserId();
  if (!clerkUserId) {
    return { planId: '', status: 'failure', error: 'Unauthenticated.' };
  }

  const user = await getUserByClerkId(clerkUserId);
  if (!user) {
    return { planId: '', status: 'failure', error: 'User not found.' };
  }

  // Atomically check plan limit and insert plan (prevents race conditions)
  // This uses a database transaction with row-level locking
  let plan: { id: string };
  try {
    plan = await atomicCheckAndInsertPlan(user.id, {
      topic: params.topic,
      skillLevel: params.skillLevel,
      weeklyHours: params.weeklyHours,
      learningStyle: params.learningStyle,
      visibility: 'private',
      origin: 'ai',
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create plan.';
    return { planId: '', status: 'failure', error: message };
  }

  const result = await runGenerationAttempt({
    planId: plan.id,
    userId: user.id,
    input: {
      topic: params.topic,
      notes: params.notes ?? null,
      skillLevel: params.skillLevel,
      weeklyHours: params.weeklyHours,
      learningStyle: params.learningStyle,
    },
  });

  if (result.status === 'success') {
    await markPlanGenerationSuccess(plan.id);

    const usage = result.metadata?.usage;
    await recordUsage({
      userId: user.id,
      provider: result.metadata?.provider ?? 'unknown',
      model: result.metadata?.model ?? 'unknown',
      inputTokens: usage?.promptTokens ?? undefined,
      outputTokens: usage?.completionTokens ?? undefined,
      costCents: 0,
      kind: 'plan',
    });

    return {
      planId: plan.id,
      status: 'success',
      modulesCount: result.modules.length,
      tasksCount: result.modules.reduce((s, m) => s + m.tasks.length, 0),
    };
  }

  await markPlanGenerationFailure(plan.id);

  // Record AI usage even on failure when provider reports token usage
  const failedUsage = result.metadata?.usage;
  await recordUsage({
    userId: user.id,
    provider: result.metadata?.provider ?? 'unknown',
    model: result.metadata?.model ?? 'unknown',
    inputTokens: failedUsage?.promptTokens ?? undefined,
    outputTokens: failedUsage?.completionTokens ?? undefined,
    costCents: 0,
  });

  const message =
    typeof result.error === 'string'
      ? result.error
      : result.error instanceof Error
        ? result.error.message
        : 'Generation failed.';
  return { planId: plan.id, status: 'failure', error: message };
}
