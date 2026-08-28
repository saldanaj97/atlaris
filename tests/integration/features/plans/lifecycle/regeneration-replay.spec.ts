import { MockGenerationProvider } from '@/features/ai/providers/mock';
import { reserveRegenerationQuotaAtProviderStart } from '@/features/billing/regeneration-quota-boundary';
import { getCurrentMonth } from '@/features/billing/usage-metrics';
import {
  completeJob,
  enqueueJob,
  failJob,
  getNextJob,
} from '@/features/jobs/queue';
import { JOB_TYPES } from '@/features/jobs/types';
import { createPlanLifecycleService } from '@/features/plans/lifecycle/factory';
import { reserveAttemptSlot } from '@/lib/db/queries/attempts';
import {
  generationAttempts,
  jobQueue,
  learningPlans,
  users,
  usageMetrics,
} from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createPlan } from '@tests/fixtures/plans';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { and, asc, eq } from 'drizzle-orm';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const GENERATION_INPUT = {
  topic: 'Durable regeneration replay',
  skillLevel: 'beginner' as const,
  weeklyHours: 5,
  learningStyle: 'mixed' as const,
  startDate: null,
  deadlineDate: null,
};

async function readRegenerationUsage(userId: string): Promise<number> {
  const [metrics] = await db
    .select({ regenerationsUsed: usageMetrics.regenerationsUsed })
    .from(usageMetrics)
    .where(
      and(
        eq(usageMetrics.userId, userId),
        eq(usageMetrics.month, getCurrentMonth()),
      ),
    );

  return metrics?.regenerationsUsed ?? 0;
}

function regenerationWorkflowMetadata(jobId: string, queueAttempt = 0) {
  return {
    provider: 'workflow-sdk' as const,
    runId: `wrun_${jobId}`,
    idempotencyKey: `plan-regeneration:${jobId}:${queueAttempt}`,
  };
}

async function createClaimedRegenerationFixture(key: string) {
  const authUserId = buildTestAuthUserId(`regeneration-durability-${key}`);
  const userId = await ensureUser({
    authUserId,
    email: buildTestEmail(authUserId),
    subscriptionTier: 'pro',
  });
  const plan = await createPlan(userId, {
    topic: GENERATION_INPUT.topic,
    generationStatus: 'ready',
  });
  const jobId = await enqueueJob(JOB_TYPES.PLAN_REGENERATION, plan.id, userId, {
    planId: plan.id,
  });
  const claimed = await getNextJob([JOB_TYPES.PLAN_REGENERATION]);
  if (!claimed || claimed.id !== jobId) {
    throw new Error(
      'Expected regeneration job to be claimed for durability test',
    );
  }

  return { userId, plan, jobId, claimed };
}

describe('regeneration lifecycle reservation replay', () => {
  beforeAll(() => {
    vi.stubEnv('AI_PROVIDER', 'mock');
    vi.stubEnv('MOCK_GENERATION_DELAY_MS', '0');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('replays after settlement and rotates a failed queue retry attempt', async () => {
    const authUserId = buildTestAuthUserId('regeneration-lifecycle-replay');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'pro',
    });
    const plan = await createPlan(userId, {
      topic: GENERATION_INPUT.topic,
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
      dbClient: db,
    });
    if (!reservation.reserved) {
      throw new Error(`Expected reservation, got ${reservation.reason}`);
    }

    const settled = await reserveRegenerationQuotaAtProviderStart({
      userId,
      planId: plan.id,
      jobId,
      dbClient: db,
    });
    expect(settled).toMatchObject({ ok: true, alreadySettled: false });
    expect(await readRegenerationUsage(userId)).toBe(1);

    const generateSpy = vi.spyOn(MockGenerationProvider.prototype, 'generate');
    const lifecycle = createPlanLifecycleService({ dbClient: db });
    const replayResult =
      await lifecycle.processGenerationAttemptWithReservation(
        {
          planId: plan.id,
          userId,
          tier: 'pro',
          input: GENERATION_INPUT,
          generationPurpose: 'regeneration',
          onAttemptReserved: async () => {
            const replaySettlement =
              await reserveRegenerationQuotaAtProviderStart({
                userId,
                planId: plan.id,
                jobId,
                dbClient: db,
              });
            expect(replaySettlement).toMatchObject({
              ok: true,
              alreadySettled: true,
            });
          },
        },
        reservation,
      );

    expect(replayResult.status).toBe('generation_success');
    expect(generateSpy).toHaveBeenCalledTimes(1);
    expect(await readRegenerationUsage(userId)).toBe(1);

    await completeJob(jobId, {
      planId: plan.id,
      modulesCount: 0,
      tasksCount: 0,
      durationMs: 0,
    });

    const retryJobId = await enqueueJob(
      JOB_TYPES.PLAN_REGENERATION,
      plan.id,
      userId,
      { planId: plan.id },
    );
    expect((await getNextJob([JOB_TYPES.PLAN_REGENERATION]))?.id).toBe(
      retryJobId,
    );

    const failedReservation = await reserveAttemptSlot({
      planId: plan.id,
      userId,
      input: GENERATION_INPUT,
      generationPurpose: 'regeneration',
      dbClient: db,
    });
    if (!failedReservation.reserved) {
      throw new Error(
        `Expected failure reservation, got ${failedReservation.reason}`,
      );
    }
    expect(failedReservation.attemptId).not.toBe(reservation.attemptId);

    const failedSettlement = await reserveRegenerationQuotaAtProviderStart({
      userId,
      planId: plan.id,
      jobId: retryJobId,
      dbClient: db,
    });
    expect(failedSettlement).toMatchObject({
      ok: true,
      alreadySettled: false,
    });

    vi.stubEnv('MOCK_AI_SCENARIO', 'provider_error');
    const failureResult =
      await lifecycle.processGenerationAttemptWithReservation(
        {
          planId: plan.id,
          userId,
          tier: 'pro',
          input: GENERATION_INPUT,
          generationPurpose: 'regeneration',
          onAttemptReserved: async () => {
            const replaySettlement =
              await reserveRegenerationQuotaAtProviderStart({
                userId,
                planId: plan.id,
                jobId: retryJobId,
                dbClient: db,
              });
            expect(replaySettlement).toMatchObject({
              ok: true,
              alreadySettled: true,
            });
          },
        },
        failedReservation,
      );
    vi.stubEnv('MOCK_AI_SCENARIO', 'success');

    expect(failureResult.status).toBe('retryable_failure');
    const failedRetryJob = await failJob(retryJobId, 'provider failed', {
      retryable: true,
    });
    expect(failedRetryJob?.status).toBe('pending');
    await db
      .update(jobQueue)
      .set({ scheduledFor: new Date() })
      .where(eq(jobQueue.id, retryJobId));
    expect((await getNextJob([JOB_TYPES.PLAN_REGENERATION]))?.id).toBe(
      retryJobId,
    );

    const retryReservation = await reserveAttemptSlot({
      planId: plan.id,
      userId,
      input: GENERATION_INPUT,
      generationPurpose: 'regeneration',
      dbClient: db,
    });
    if (!retryReservation.reserved) {
      throw new Error(
        `Expected retry reservation, got ${retryReservation.reason}`,
      );
    }
    expect(retryReservation.attemptId).not.toBe(failedReservation.attemptId);

    const retrySettlement = await reserveRegenerationQuotaAtProviderStart({
      userId,
      planId: plan.id,
      jobId: retryJobId,
      dbClient: db,
    });
    expect(retrySettlement).toMatchObject({ ok: true, alreadySettled: false });

    const retryResult = await lifecycle.processGenerationAttemptWithReservation(
      {
        planId: plan.id,
        userId,
        tier: 'pro',
        input: GENERATION_INPUT,
        generationPurpose: 'regeneration',
        onAttemptReserved: async () => {
          const replaySettlement =
            await reserveRegenerationQuotaAtProviderStart({
              userId,
              planId: plan.id,
              jobId: retryJobId,
              dbClient: db,
            });
          expect(replaySettlement).toMatchObject({
            ok: true,
            alreadySettled: true,
          });
        },
      },
      retryReservation,
    );

    expect(retryResult.status).toBe('generation_success');
    expect(generateSpy).toHaveBeenCalledTimes(3);
    expect(await readRegenerationUsage(userId)).toBe(3);

    const attempts = await db
      .select({ id: generationAttempts.id, status: generationAttempts.status })
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, plan.id))
      .orderBy(asc(generationAttempts.createdAt));
    expect(attempts).toEqual([
      { id: reservation.attemptId, status: 'success' },
      { id: failedReservation.attemptId, status: 'failure' },
      { id: retryReservation.attemptId, status: 'success' },
    ]);
  });

  it('reuses a committed reservation when the reserve step result is replayed', async () => {
    const { userId, plan, jobId } =
      await createClaimedRegenerationFixture('reserve-replay');
    const workflowMetadata = regenerationWorkflowMetadata(jobId);

    const first = await reserveAttemptSlot({
      planId: plan.id,
      userId,
      input: GENERATION_INPUT,
      generationPurpose: 'regeneration',
      workflowMetadata,
      dbClient: db,
    });
    if (!first.reserved) {
      throw new Error(`Expected reservation, got ${first.reason}`);
    }

    const replay = await reserveAttemptSlot({
      planId: plan.id,
      userId,
      input: GENERATION_INPUT,
      generationPurpose: 'regeneration',
      workflowMetadata,
      dbClient: db,
    });

    await db
      .update(users)
      .set({ subscriptionTier: 'free' })
      .where(eq(users.id, userId));
    const changedTierReplay = await reserveAttemptSlot({
      planId: plan.id,
      userId,
      input: GENERATION_INPUT,
      generationPurpose: 'regeneration',
      workflowMetadata,
      dbClient: db,
    });

    expect(replay).toMatchObject({
      reserved: true,
      attemptId: first.attemptId,
      attemptNumber: first.attemptNumber,
      promptHash: first.promptHash,
    });
    expect(changedTierReplay).toMatchObject({
      reserved: true,
      attemptId: first.attemptId,
      admittedTier: 'pro',
    });
    const attempts = await db
      .select({ id: generationAttempts.id, status: generationAttempts.status })
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, plan.id));
    expect(attempts).toEqual([{ id: first.attemptId, status: 'in_progress' }]);

    const [stored] = await db
      .select({ metadata: generationAttempts.metadata })
      .from(generationAttempts)
      .where(eq(generationAttempts.id, first.attemptId));
    expect(
      (stored?.metadata as { workflow?: { idempotencyKey?: string } })
        ?.workflow,
    ).toMatchObject({ idempotencyKey: workflowMetadata.idempotencyKey });
  });

  it('finalizes a reserved attempt when tier quota denies after admission', async () => {
    const { userId, plan, jobId } =
      await createClaimedRegenerationFixture('tier-denial');
    const reservation = await reserveAttemptSlot({
      planId: plan.id,
      userId,
      input: GENERATION_INPUT,
      generationPurpose: 'regeneration',
      workflowMetadata: regenerationWorkflowMetadata(jobId),
      dbClient: db,
    });
    if (!reservation.reserved) {
      throw new Error(`Expected reservation, got ${reservation.reason}`);
    }

    await db
      .update(users)
      .set({ subscriptionTier: 'free' })
      .where(eq(users.id, userId));

    const generateSpy = vi.spyOn(MockGenerationProvider.prototype, 'generate');
    const lifecycle = createPlanLifecycleService({ dbClient: db });
    const result = await lifecycle.processGenerationAttemptWithReservation(
      {
        planId: plan.id,
        userId,
        tier: 'pro',
        input: GENERATION_INPUT,
        generationPurpose: 'regeneration',
        workflowMetadata: regenerationWorkflowMetadata(jobId),
        onAttemptReserved: async () => {
          const quota = await reserveRegenerationQuotaAtProviderStart({
            userId,
            planId: plan.id,
            jobId,
            dbClient: db,
          });
          if (!quota.ok) {
            throw new Error(
              'Regeneration quota exceeded for your subscription tier.',
            );
          }
        },
      },
      reservation,
    );

    expect(result).toMatchObject({
      status: 'retryable_failure',
      classification: 'provider_error',
    });
    expect(generateSpy).not.toHaveBeenCalled();

    const [attempt] = await db
      .select({ status: generationAttempts.status })
      .from(generationAttempts)
      .where(eq(generationAttempts.id, reservation.attemptId));
    const [updatedPlan] = await db
      .select({
        generationStatus: learningPlans.generationStatus,
        isQuotaEligible: learningPlans.isQuotaEligible,
      })
      .from(learningPlans)
      .where(eq(learningPlans.id, plan.id));
    expect(attempt?.status).toBe('failure');
    expect(updatedPlan).toMatchObject({
      generationStatus: 'ready',
      isQuotaEligible: true,
    });
  });

  it('recovers terminal success and failure replay, then rotates an explicit retry', async () => {
    const successFixture =
      await createClaimedRegenerationFixture('success-replay');
    const successMetadata = regenerationWorkflowMetadata(successFixture.jobId);
    const successReservation = await reserveAttemptSlot({
      planId: successFixture.plan.id,
      userId: successFixture.userId,
      input: GENERATION_INPUT,
      generationPurpose: 'regeneration',
      workflowMetadata: successMetadata,
      dbClient: db,
    });
    if (!successReservation.reserved) {
      throw new Error(`Expected reservation, got ${successReservation.reason}`);
    }
    const successSpy = vi.spyOn(MockGenerationProvider.prototype, 'generate');
    const lifecycle = createPlanLifecycleService({ dbClient: db });
    const success = await lifecycle.processGenerationAttemptWithReservation(
      {
        planId: successFixture.plan.id,
        userId: successFixture.userId,
        tier: 'pro',
        input: GENERATION_INPUT,
        generationPurpose: 'regeneration',
        workflowMetadata: successMetadata,
      },
      successReservation,
    );
    const successReplay =
      await lifecycle.processGenerationAttemptWithReservation(
        {
          planId: successFixture.plan.id,
          userId: successFixture.userId,
          tier: 'pro',
          input: GENERATION_INPUT,
          generationPurpose: 'regeneration',
        },
        successReservation,
      );
    expect(success.status).toBe('generation_success');
    expect(successReplay).toMatchObject({
      status: 'already_finalized',
      planId: successFixture.plan.id,
    });
    expect(successSpy).toHaveBeenCalledTimes(1);

    const failureFixture =
      await createClaimedRegenerationFixture('failure-replay');
    const failureMetadata = regenerationWorkflowMetadata(failureFixture.jobId);
    const failureReservation = await reserveAttemptSlot({
      planId: failureFixture.plan.id,
      userId: failureFixture.userId,
      input: GENERATION_INPUT,
      generationPurpose: 'regeneration',
      workflowMetadata: failureMetadata,
      dbClient: db,
    });
    if (!failureReservation.reserved) {
      throw new Error(`Expected reservation, got ${failureReservation.reason}`);
    }

    vi.stubEnv('MOCK_AI_SCENARIO', 'provider_error');
    const failure = await lifecycle.processGenerationAttemptWithReservation(
      {
        planId: failureFixture.plan.id,
        userId: failureFixture.userId,
        tier: 'pro',
        input: GENERATION_INPUT,
        generationPurpose: 'regeneration',
        workflowMetadata: failureMetadata,
      },
      failureReservation,
    );
    vi.stubEnv('MOCK_AI_SCENARIO', 'success');
    const failureReplay =
      await lifecycle.processGenerationAttemptWithReservation(
        {
          planId: failureFixture.plan.id,
          userId: failureFixture.userId,
          tier: 'pro',
          input: GENERATION_INPUT,
          generationPurpose: 'regeneration',
        },
        failureReservation,
      );
    expect(failure.status).toBe('retryable_failure');
    expect(failureReplay).toMatchObject({
      status: 'retryable_failure',
      classification: 'provider_error',
    });

    const failedJob = await failJob(failureFixture.jobId, 'provider failed', {
      retryable: true,
    });
    expect(failedJob?.status).toBe('pending');
    await db
      .update(jobQueue)
      .set({ scheduledFor: new Date() })
      .where(eq(jobQueue.id, failureFixture.jobId));
    expect((await getNextJob([JOB_TYPES.PLAN_REGENERATION]))?.id).toBe(
      failureFixture.jobId,
    );

    const retryReservation = await reserveAttemptSlot({
      planId: failureFixture.plan.id,
      userId: failureFixture.userId,
      input: GENERATION_INPUT,
      generationPurpose: 'regeneration',
      workflowMetadata: regenerationWorkflowMetadata(failureFixture.jobId, 1),
      dbClient: db,
    });
    if (!retryReservation.reserved) {
      throw new Error(
        `Expected retry reservation, got ${retryReservation.reason}`,
      );
    }
    const retry = await lifecycle.processGenerationAttemptWithReservation(
      {
        planId: failureFixture.plan.id,
        userId: failureFixture.userId,
        tier: 'pro',
        input: GENERATION_INPUT,
        generationPurpose: 'regeneration',
      },
      retryReservation,
    );
    expect(retry.status).toBe('generation_success');
    expect(retryReservation.attemptId).not.toBe(failureReservation.attemptId);
    expect(successSpy).toHaveBeenCalledTimes(3);
  });
});
