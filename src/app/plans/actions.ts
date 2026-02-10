'use server';

import { runGenerationAttempt } from '@/lib/ai/orchestrator';
import { getEffectiveAuthUserId } from '@/lib/api/auth';
import { getUserByAuthId } from '@/lib/db/queries/users';
import { getDb } from '@/lib/db/runtime';
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
  startDate?: string | null;
  deadlineDate?: string | null;
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
  const authUserId = await getEffectiveAuthUserId();
  if (!authUserId) {
    return { planId: '', status: 'failure', error: 'Unauthenticated.' };
  }

  const user = await getUserByAuthId(authUserId);
  if (!user) {
    return { planId: '', status: 'failure', error: 'User not found.' };
  }

  // Atomically check plan limit and insert plan (prevents race conditions)
  // This uses a database transaction with row-level locking
  const db = getDb();
  let plan: { id: string };
  try {
    plan = await atomicCheckAndInsertPlan(
      user.id,
      {
        topic: params.topic,
        skillLevel: params.skillLevel,
        weeklyHours: params.weeklyHours,
        learningStyle: params.learningStyle,
        startDate: params.startDate ?? null,
        deadlineDate: params.deadlineDate ?? null,
        visibility: 'private',
        origin: 'ai',
      },
      db
    );
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
      startDate: params.startDate ?? null,
      deadlineDate: params.deadlineDate ?? null,
    },
  });

  if (result.status === 'success') {
    await markPlanGenerationSuccess(plan.id, db);

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

  // Intentionally do not record usage on failure for this action.
  // Tests assert zero ai_usage_events when generation fails.
  await markPlanGenerationFailure(plan.id, db);

  const message =
    typeof result.error === 'string'
      ? result.error
      : result.error instanceof Error
        ? result.error.message
        : 'Generation failed.';

  return { planId: plan.id, status: 'failure', error: message };
}
