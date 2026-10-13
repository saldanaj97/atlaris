import { enqueueJob, getNextJob } from '@/features/jobs/queue';
import { JOB_TYPES, type PlanRegenerationJobData } from '@/features/jobs/types';
import { planRegenerationWorkflow } from '@/features/plans/workflows/plan-regeneration.workflow';
import { reserveAttemptSlot } from '@/lib/db/queries/attempts';
import { generationAttempts, jobQueue, learningPlans } from '@supabase/schema';
import { db } from '@supabase/service-role';
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

async function assertRegenerationAdmissionDenialLeavesNoOrphans(params: {
  scenario: string;
  tier: 'free' | 'starter' | 'pro';
  plan?: {
    startDate?: string | null;
    deadlineDate?: string | null;
  };
  overrides?: PlanRegenerationJobData['overrides'];
  message: string;
}): Promise<void> {
  const authUserId = buildTestAuthUserId(
    `workflow-regeneration-${params.scenario}`,
  );
  const userId = await ensureUser({
    authUserId,
    email: buildTestEmail(authUserId),
    subscriptionTier: params.tier,
  });
  const plan = await createTestPlan({
    userId,
    generationStatus: 'ready',
    ...params.plan,
  });
  const jobId = await enqueueJob(JOB_TYPES.PLAN_REGENERATION, plan.id, userId, {
    planId: plan.id,
    ...(params.overrides ? { overrides: params.overrides } : {}),
  });

  const run = await start(planRegenerationWorkflow, [
    {
      jobId,
      planId: plan.id,
      userId,
      correlationId: `workflow-regeneration-${jobId}`,
    },
  ]);

  await expect(run.returnValue).rejects.toThrow(params.message);
  expect(await run.status).toBe('failed');

  const [persistedJob] = await db
    .select({ status: jobQueue.status, error: jobQueue.error })
    .from(jobQueue)
    .where(eq(jobQueue.id, jobId));
  expect(persistedJob).toEqual({
    status: 'failed',
    error: params.message,
  });

  const [persistedPlan] = await db
    .select({
      generationStatus: learningPlans.generationStatus,
      isQuotaEligible: learningPlans.isQuotaEligible,
    })
    .from(learningPlans)
    .where(eq(learningPlans.id, plan.id));
  expect(persistedPlan).toEqual({
    generationStatus: 'ready',
    isQuotaEligible: true,
  });

  const attempts = await db
    .select({ id: generationAttempts.id })
    .from(generationAttempts)
    .where(eq(generationAttempts.planId, plan.id));
  expect(attempts).toEqual([]);
}

describe('production Workflow SDK entrypoints', () => {
  it('runs plan regeneration to a persisted successful terminal state', async () => {
    const userId = await createWorkflowUser('plan-regeneration');
    const plan = await createTestPlan({ userId, generationStatus: 'ready' });
    const jobId = await enqueueJob(
      JOB_TYPES.PLAN_REGENERATION,
      plan.id,
      userId,
      { planId: plan.id },
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

  it('rejects Free regeneration before reserving an attempt', async () => {
    await expect(
      assertRegenerationAdmissionDenialLeavesNoOrphans({
        scenario: 'free-denial',
        tier: 'free',
        message: 'Plan regeneration is not included on the Free plan.',
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects an over-duration Starter regeneration before reserving an attempt', async () => {
    await expect(
      assertRegenerationAdmissionDenialLeavesNoOrphans({
        scenario: 'duration-denial',
        tier: 'starter',
        plan: { startDate: '2026-01-01', deadlineDate: '2026-04-01' },
        message:
          'starter tier limited to 8-week plans. Upgrade to pro for longer plans.',
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects a tier-denied model before reserving an attempt', async () => {
    await expect(
      assertRegenerationAdmissionDenialLeavesNoOrphans({
        scenario: 'model-denial',
        tier: 'starter',
        overrides: { model: 'google/gemini-3.1-pro-preview' },
        message: 'Model is not allowed for regeneration on this tier.',
      }),
    ).resolves.toBeUndefined();
  });

  it('compensates a replayed Free reservation without leaving generation in progress', async () => {
    const authUserId = buildTestAuthUserId('workflow-regeneration-free-replay');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const plan = await createTestPlan({
      userId,
      topic: GENERATION_INPUT.topic,
      skillLevel: GENERATION_INPUT.skillLevel,
      weeklyHours: GENERATION_INPUT.weeklyHours,
      learningStyle: GENERATION_INPUT.learningStyle,
      generationStatus: 'ready',
    });
    const jobId = await enqueueJob(
      JOB_TYPES.PLAN_REGENERATION,
      plan.id,
      userId,
      { planId: plan.id },
    );
    expect((await getNextJob([JOB_TYPES.PLAN_REGENERATION]))?.id).toBe(jobId);

    const reservation = await reserveAttemptSlot({
      planId: plan.id,
      userId,
      input: GENERATION_INPUT,
      generationPurpose: 'regeneration',
      workflowMetadata: {
        provider: 'workflow-sdk',
        runId: 'wrun_preseeded',
        idempotencyKey: `plan-regeneration:${jobId}:0`,
      },
      dbClient: db,
    });
    if (!reservation.reserved) {
      throw new Error(`Expected reservation, got ${reservation.reason}`);
    }

    const run = await start(planRegenerationWorkflow, [
      {
        jobId,
        planId: plan.id,
        userId,
        correlationId: `workflow-regeneration-${jobId}`,
      },
    ]);

    await expect(run.returnValue).rejects.toThrow(
      'Plan regeneration is not included on the Free plan.',
    );
    expect(await run.status).toBe('failed');

    const [persistedJob] = await db
      .select({ status: jobQueue.status, error: jobQueue.error })
      .from(jobQueue)
      .where(eq(jobQueue.id, jobId));
    expect(persistedJob).toEqual({
      status: 'failed',
      error: 'Plan regeneration is not included on the Free plan.',
    });

    const [persistedPlan] = await db
      .select({
        generationStatus: learningPlans.generationStatus,
        isQuotaEligible: learningPlans.isQuotaEligible,
      })
      .from(learningPlans)
      .where(eq(learningPlans.id, plan.id));
    expect(persistedPlan).toEqual({
      generationStatus: 'ready',
      isQuotaEligible: true,
    });

    const [attempt] = await db
      .select({
        status: generationAttempts.status,
        classification: generationAttempts.classification,
      })
      .from(generationAttempts)
      .where(eq(generationAttempts.id, reservation.attemptId));
    expect(attempt).toEqual({
      status: 'failure',
      classification: 'validation',
    });
  });
});
