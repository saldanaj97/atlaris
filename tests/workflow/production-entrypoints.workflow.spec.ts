import { enqueueJob } from '@/features/jobs/queue';
import { JOB_TYPES } from '@/features/jobs/types';
import { moduleLessonGenerationWorkflow } from '@/features/lesson-content/workflows/module-lesson-generation.workflow';
import { toSerializableReservation } from '@/features/plans/workflows/plan-generation.types';
import { planGenerationWorkflow } from '@/features/plans/workflows/plan-generation.workflow';
import { planRegenerationWorkflow } from '@/features/plans/workflows/plan-regeneration.workflow';
import { reserveAttemptSlot } from '@/lib/db/queries/attempts';
import {
  generationAttempts,
  jobQueue,
  learningPlans,
  modules,
} from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createTestModule, createTestTask } from '@tests/fixtures/modules';
import { createTestPlan } from '@tests/fixtures/plans';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { start } from 'workflow/api';

const GENERATION_INPUT = {
  topic: 'Deterministic workflow testing',
  skillLevel: 'beginner' as const,
  weeklyHours: 5,
  learningStyle: 'mixed' as const,
  startDate: null,
  deadlineDate: null,
};

async function createWorkflowUser(scenario: string): Promise<string> {
  const authUserId = buildTestAuthUserId(`workflow-${scenario}`);
  return ensureUser({
    authUserId,
    email: buildTestEmail(authUserId),
    subscriptionTier: 'pro',
  });
}

describe('production Workflow SDK entrypoints', () => {
  it('runs plan generation to a persisted successful terminal state', async () => {
    const userId = await createWorkflowUser('plan-generation');
    const plan = await createTestPlan({
      userId,
      topic: GENERATION_INPUT.topic,
      generationStatus: 'failed',
    });
    const reservation = await reserveAttemptSlot({
      planId: plan.id,
      userId,
      input: GENERATION_INPUT,
      dbClient: db,
    });
    if (!reservation.reserved) {
      throw new Error(
        `Expected an attempt reservation, got ${reservation.reason}`,
      );
    }

    const run = await start(planGenerationWorkflow, [
      {
        planId: plan.id,
        userId,
        tier: 'pro',
        input: GENERATION_INPUT,
        modelOverride: null,
        correlationId: `workflow-plan-${plan.id}`,
        reservation: toSerializableReservation(reservation),
      },
    ]);

    const result = await run.returnValue;
    expect(result.status).toBe('generation_success');
    expect(await run.status).toBe('completed');

    const [persistedPlan] = await db
      .select({ status: learningPlans.generationStatus })
      .from(learningPlans)
      .where(eq(learningPlans.id, plan.id));
    const [attempt] = await db
      .select({ status: generationAttempts.status })
      .from(generationAttempts)
      .where(eq(generationAttempts.id, reservation.attemptId));
    expect(persistedPlan?.status).toBe('ready');
    expect(attempt?.status).toBe('success');
  });

  it('runs plan regeneration to a persisted successful terminal state', async () => {
    const userId = await createWorkflowUser('plan-regeneration');
    const plan = await createTestPlan({ userId, generationStatus: 'ready' });
    const jobId = await enqueueJob(
      JOB_TYPES.PLAN_REGENERATION,
      plan.id,
      userId,
      { planId: plan.id, overrides: { topic: 'Regenerated workflow topic' } },
    );

    const run = await start(planRegenerationWorkflow, [
      {
        jobId,
        planId: plan.id,
        userId,
        correlationId: `workflow-regeneration-${jobId}`,
      },
    ]);

    const result = await run.returnValue;
    expect(result).toMatchObject({
      kind: 'completed',
      jobId,
      planId: plan.id,
    });
    expect(await run.status).toBe('completed');

    const [job] = await db
      .select({ status: jobQueue.status })
      .from(jobQueue)
      .where(eq(jobQueue.id, jobId));
    expect(job?.status).toBe('completed');
  });

  it('runs module lesson generation to a persisted successful terminal state', async () => {
    const userId = await createWorkflowUser('module-lessons');
    const plan = await createTestPlan({ userId, generationStatus: 'ready' });
    const module = await createTestModule({ planId: plan.id });
    await createTestTask({ moduleId: module.id });

    const run = await start(moduleLessonGenerationWorkflow, [
      {
        userId,
        planId: plan.id,
        moduleId: module.id,
        userTier: 'pro',
        correlationId: `workflow-module-${module.id}`,
      },
    ]);

    const result = await run.returnValue;
    expect(result.kind).toBe('success');
    expect(await run.status).toBe('completed');

    const [persistedModule] = await db
      .select({ status: modules.lessonGenerationStatus })
      .from(modules)
      .where(eq(modules.id, module.id));
    expect(persistedModule?.status).toBe('ready');
  });
});
