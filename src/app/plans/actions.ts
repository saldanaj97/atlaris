'use server';

import { runGenerationAttempt } from '@/lib/ai/orchestrator';
import { getEffectiveAuthUserId } from '@/lib/api/auth';
import { getUserByAuthId } from '@/lib/db/queries/users';
import { getDb } from '@/lib/db/runtime';
import { recordUsage } from '@/lib/db/usage';
import { logger } from '@/lib/logging/logger';
import {
  atomicCheckAndInsertPlan,
  markPlanGenerationFailure,
  markPlanGenerationSuccess,
} from '@/lib/stripe/usage';

/**
 * @deprecated Keep only for backwards-compatible tests.
 * Use API routes `/api/v1/plans` + `/api/v1/plans/stream` for new callsites.
 */
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

/**
 * @deprecated Keep only for backwards-compatible tests.
 * Use API routes `/api/v1/plans` + `/api/v1/plans/stream` for new callsites.
 */
const TOPIC_MAX_LENGTH = 200;
const NOTES_MAX_LENGTH = 2000;

export async function generateLearningPlan(
  params: GenerateLearningPlanParams
): Promise<GenerateLearningPlanResult> {
  logger.info(
    {
      topic: params.topic,
      skillLevel: params.skillLevel,
      learningStyle: params.learningStyle,
      weeklyHours: params.weeklyHours,
      hasStartDate: params.startDate != null,
      hasDeadlineDate: params.deadlineDate != null,
      hasNotes: params.notes != null && params.notes !== '',
    },
    'generateLearningPlan called'
  );

  logger.debug('Resolving authentication');
  const authUserId = await getEffectiveAuthUserId();
  if (!authUserId) {
    logger.debug('generateLearningPlan: unauthenticated');
    return { planId: '', status: 'failure', error: 'Unauthenticated.' };
  }

  const user = await getUserByAuthId(authUserId);
  if (!user) {
    logger.info('generateLearningPlan: user not found for auth id');
    return { planId: '', status: 'failure', error: 'User not found.' };
  }

  // Defensive truncation for GenerateLearningPlanParams (deprecated API surface with no schema validation).
  const topic = params.topic.slice(0, TOPIC_MAX_LENGTH);
  const notes =
    params.notes != null
      ? params.notes.slice(0, NOTES_MAX_LENGTH)
      : params.notes;

  const db = getDb();
  let plan: { id: string };
  try {
    logger.debug(
      {
        topic: params.topic.slice(0, 80),
        skillLevel: params.skillLevel,
        weeklyHours: params.weeklyHours,
      },
      'Creating plan record'
    );
    plan = await atomicCheckAndInsertPlan(
      user.id,
      {
        topic,
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
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'generateLearningPlan: plan persistence failed'
    );
    return { planId: '', status: 'failure', error: message };
  }

  logger.debug({ planId: plan.id }, 'Starting AI orchestration');
  const result = await runGenerationAttempt(
    {
      planId: plan.id,
      userId: user.id,
      input: {
        topic,
        notes: notes ?? null,
        skillLevel: params.skillLevel,
        weeklyHours: params.weeklyHours,
        learningStyle: params.learningStyle,
        startDate: params.startDate ?? null,
        deadlineDate: params.deadlineDate ?? null,
      },
    },
    { dbClient: db }
  );

  if (result.status === 'success') {
    await markPlanGenerationSuccess(plan.id, db);

    const usage = result.metadata?.usage;
    logger.debug({ planId: plan.id, kind: 'plan' }, 'Recording usage');
    await recordUsage({
      userId: user.id,
      provider: result.metadata?.provider ?? 'unknown',
      model: result.metadata?.model ?? 'unknown',
      inputTokens: usage?.promptTokens ?? undefined,
      outputTokens: usage?.completionTokens ?? undefined,
      costCents: 0,
      kind: 'plan',
    });

    const modulesCount = result.modules.length;
    const tasksCount = result.modules.reduce((s, m) => s + m.tasks.length, 0);
    logger.info(
      { planId: plan.id, modulesCount, tasksCount },
      'generateLearningPlan completed successfully'
    );
    return {
      planId: plan.id,
      status: 'success',
      modulesCount,
      tasksCount,
    };
  }

  await markPlanGenerationFailure(plan.id, db);

  const message =
    typeof result.error === 'string'
      ? result.error
      : result.error instanceof Error
        ? result.error.message
        : 'Generation failed.';

  logger.info(
    { planId: plan.id, error: message },
    'generateLearningPlan completed with failure'
  );
  return { planId: plan.id, status: 'failure', error: message };
}
