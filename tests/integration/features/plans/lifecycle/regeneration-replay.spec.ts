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
import { generationAttempts, jobQueue, usageMetrics } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createPlan } from '@tests/fixtures/plans';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

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

describe('regeneration lifecycle reservation replay', () => {
  beforeAll(() => {
    vi.stubEnv('AI_PROVIDER', 'mock');
    vi.stubEnv('MOCK_GENERATION_DELAY_MS', '0');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
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
});
