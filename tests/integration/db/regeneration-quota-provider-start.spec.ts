import { reserveRegenerationQuotaAtProviderStart } from '@/features/billing/regeneration-quota-boundary';
import { getCurrentMonth } from '@/features/billing/usage-metrics';
import { enqueueJobWithResult, failJob } from '@/features/jobs/queue';
import { JOB_TYPES } from '@/features/jobs/types';
import { planRegenerationJobPayloadSchema } from '@/features/plans/regeneration-orchestration/schema';
import { jobQueue, usageMetrics } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createPlan } from '@tests/fixtures/plans';
import { claimPendingRegenerationJob } from '@tests/helpers/db/jobs';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

async function createProcessingRegenerationJob(
  scenario: string,
  subscriptionTier: 'free' | 'pro' = 'pro',
) {
  const authUserId = buildTestAuthUserId(scenario);
  const userId = await ensureUser({
    authUserId,
    email: buildTestEmail(authUserId),
    subscriptionTier,
  });
  const plan = await createPlan(userId);
  return await claimNextRegenerationJob(userId, plan.id);
}

async function claimNextRegenerationJob(userId: string, planId: string) {
  const plan = { id: planId };
  const { id: jobId } = await enqueueJobWithResult(
    JOB_TYPES.PLAN_REGENERATION,
    plan.id,
    userId,
    { planId: plan.id },
  );
  const claimed = await claimPendingRegenerationJob(jobId);

  expect(claimed?.status).toBe('processing');

  return { jobId, planId: plan.id, userId };
}

async function readRegenerationUsage(userId: string) {
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

describe('regeneration provider-start quota settlement', () => {
  it('settles once, replays idempotently, and settles a new retry once', async () => {
    const fixture = await createProcessingRegenerationJob(
      'regeneration-quota-replay',
    );

    const first = await reserveRegenerationQuotaAtProviderStart({
      ...fixture,
      dbClient: db,
    });
    expect(first).toMatchObject({
      ok: true,
      alreadySettled: false,
      providerStartedAt: expect.any(String),
    });
    expect(await readRegenerationUsage(fixture.userId)).toBe(1);

    const replay = await reserveRegenerationQuotaAtProviderStart({
      ...fixture,
      dbClient: db,
    });
    expect(replay).toEqual({
      ok: true,
      alreadySettled: true,
      providerStartedAt:
        first.ok && first.providerStartedAt
          ? first.providerStartedAt
          : expect.any(String),
    });
    expect(await readRegenerationUsage(fixture.userId)).toBe(1);

    const retried = await failJob(fixture.jobId, 'provider failed', {
      retryable: true,
    });
    expect(retried?.status).toBe('pending');
    await db
      .update(jobQueue)
      .set({ scheduledFor: new Date() })
      .where(eq(jobQueue.id, fixture.jobId));
    expect((await claimPendingRegenerationJob(fixture.jobId))?.status).toBe(
      'processing',
    );

    const retrySettlement = await reserveRegenerationQuotaAtProviderStart({
      ...fixture,
      dbClient: db,
    });
    expect(retrySettlement).toMatchObject({
      ok: true,
      alreadySettled: false,
      providerStartedAt: expect.any(String),
    });
    expect(await readRegenerationUsage(fixture.userId)).toBe(2);

    const retryReplay = await reserveRegenerationQuotaAtProviderStart({
      ...fixture,
      dbClient: db,
    });
    expect(retryReplay).toMatchObject({
      ok: true,
      alreadySettled: true,
    });
    expect(await readRegenerationUsage(fixture.userId)).toBe(2);
  });

  it('rolls back usage when provider-start marker persistence verification fails', async () => {
    const fixture = await createProcessingRegenerationJob(
      'regeneration-quota-marker-rollback',
    );
    const actualSafeParse = planRegenerationJobPayloadSchema.safeParse.bind(
      planRegenerationJobPayloadSchema,
    );
    const safeParse = vi
      .spyOn(planRegenerationJobPayloadSchema, 'safeParse')
      .mockImplementation((value) => {
        if (safeParse.mock.calls.length === 3) {
          return {
            success: false,
            error: new z.ZodError([]),
          } as ReturnType<typeof planRegenerationJobPayloadSchema.safeParse>;
        }
        return actualSafeParse(value);
      });

    try {
      await expect(
        reserveRegenerationQuotaAtProviderStart({
          ...fixture,
          dbClient: db,
        }),
      ).rejects.toThrow('Failed to persist regeneration provider-start marker');
    } finally {
      safeParse.mockRestore();
    }

    expect(await readRegenerationUsage(fixture.userId)).toBe(0);
    const [job] = await db
      .select({ payload: jobQueue.payload })
      .from(jobQueue)
      .where(eq(jobQueue.id, fixture.jobId));
    expect(job?.payload).toEqual({ planId: fixture.planId });
  });

  it('fails before settlement when the durable marker payload is malformed', async () => {
    const fixture = await createProcessingRegenerationJob(
      'regeneration-quota-marker-invalid',
    );
    await db
      .update(jobQueue)
      .set({
        payload: {
          planId: fixture.planId,
          quota: { providerStartedAt: 'not-a-date' },
        },
      })
      .where(eq(jobQueue.id, fixture.jobId));

    await expect(
      reserveRegenerationQuotaAtProviderStart({
        ...fixture,
        dbClient: db,
      }),
    ).rejects.toThrow('invalid job payload');
    expect(await readRegenerationUsage(fixture.userId)).toBe(0);
  });

  it('caps a grounded Free run per plan without the monthly meter', async () => {
    const fixture = await createProcessingRegenerationJob(
      'regeneration-quota-grounded-free',
      'free',
    );

    await expect(
      reserveRegenerationQuotaAtProviderStart({
        ...fixture,
        dbClient: db,
        groundedTier: 'free',
      }),
    ).resolves.toMatchObject({ ok: true, alreadySettled: false });
    expect(await readRegenerationUsage(fixture.userId)).toBe(0);

    await db
      .update(jobQueue)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(jobQueue.id, fixture.jobId));
    const second = await claimNextRegenerationJob(
      fixture.userId,
      fixture.planId,
    );

    await expect(
      reserveRegenerationQuotaAtProviderStart({
        ...second,
        dbClient: db,
        groundedTier: 'free',
      }),
    ).resolves.toEqual({ ok: false, currentCount: 1, limit: 1 });
    const [job] = await db
      .select({ payload: jobQueue.payload })
      .from(jobQueue)
      .where(eq(jobQueue.id, second.jobId));
    expect(job?.payload).toEqual({ planId: fixture.planId });
  });
});
