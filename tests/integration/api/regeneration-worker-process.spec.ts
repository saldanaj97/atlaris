import { desc, eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import { POST as POST_REGENERATE } from '@/app/api/v1/plans/[planId]/regenerate/route';
import { POST as POST_DRAIN } from '@/app/api/internal/jobs/regeneration/process/route';
import { jobQueue, learningPlans, modules } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';

import { createPlan } from '../../fixtures/plans';
import { setTestUser } from '../../helpers/auth';
import { ensureUser, resetDbForIntegrationTestFile } from '../../helpers/db';

const ORIGINAL_ENV = {
  AI_PROVIDER: process.env.AI_PROVIDER,
  AI_USE_MOCK: process.env.AI_USE_MOCK,
  MOCK_GENERATION_FAILURE_RATE: process.env.MOCK_GENERATION_FAILURE_RATE,
  MOCK_GENERATION_DELAY_MS: process.env.MOCK_GENERATION_DELAY_MS,
  REGENERATION_INLINE_PROCESSING: process.env.REGENERATION_INLINE_PROCESSING,
  REGENERATION_QUEUE_ENABLED: process.env.REGENERATION_QUEUE_ENABLED,
};

async function createRegenerateRequest(planId: string, body: unknown) {
  return {
    request: new Request(`http://localhost/api/v1/plans/${planId}/regenerate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    context: { params: Promise.resolve({ planId }) },
  };
}

describe('POST /api/internal/jobs/regeneration/process', () => {
  afterEach(() => {
    if (ORIGINAL_ENV.AI_PROVIDER === undefined) {
      delete process.env.AI_PROVIDER;
    } else {
      process.env.AI_PROVIDER = ORIGINAL_ENV.AI_PROVIDER;
    }
    if (ORIGINAL_ENV.AI_USE_MOCK === undefined) {
      delete process.env.AI_USE_MOCK;
    } else {
      process.env.AI_USE_MOCK = ORIGINAL_ENV.AI_USE_MOCK;
    }
    if (ORIGINAL_ENV.MOCK_GENERATION_FAILURE_RATE === undefined) {
      delete process.env.MOCK_GENERATION_FAILURE_RATE;
    } else {
      process.env.MOCK_GENERATION_FAILURE_RATE =
        ORIGINAL_ENV.MOCK_GENERATION_FAILURE_RATE;
    }
    if (ORIGINAL_ENV.MOCK_GENERATION_DELAY_MS === undefined) {
      delete process.env.MOCK_GENERATION_DELAY_MS;
    } else {
      process.env.MOCK_GENERATION_DELAY_MS =
        ORIGINAL_ENV.MOCK_GENERATION_DELAY_MS;
    }
    if (ORIGINAL_ENV.REGENERATION_INLINE_PROCESSING === undefined) {
      delete process.env.REGENERATION_INLINE_PROCESSING;
    } else {
      process.env.REGENERATION_INLINE_PROCESSING =
        ORIGINAL_ENV.REGENERATION_INLINE_PROCESSING;
    }
    if (ORIGINAL_ENV.REGENERATION_QUEUE_ENABLED === undefined) {
      delete process.env.REGENERATION_QUEUE_ENABLED;
    } else {
      process.env.REGENERATION_QUEUE_ENABLED =
        ORIGINAL_ENV.REGENERATION_QUEUE_ENABLED;
    }
  });

  it('drains queued regeneration jobs and finalizes plan state', async () => {
    await resetDbForIntegrationTestFile();

    process.env.AI_PROVIDER = 'mock';
    process.env.AI_USE_MOCK = 'true';
    process.env.MOCK_GENERATION_FAILURE_RATE = '0';
    process.env.MOCK_GENERATION_DELAY_MS = '10';
    process.env.REGENERATION_INLINE_PROCESSING = 'false';
    process.env.REGENERATION_QUEUE_ENABLED = 'true';

    const authUserId = 'auth_regeneration_worker_drain';
    setTestUser(authUserId);
    const userId = await ensureUser({
      authUserId,
      email: 'regeneration-worker-drain@example.com',
      subscriptionTier: 'pro',
    });

    const plan = await createPlan(userId);

    const { request, context } = await createRegenerateRequest(plan.id, {
      overrides: { topic: 'worker drain topic' },
    });
    const enqueueResponse = await POST_REGENERATE(request, context);
    expect(enqueueResponse.status).toBe(202);

    const drainResponse = await POST_DRAIN(
      new Request('http://localhost/api/internal/jobs/regeneration/process', {
        method: 'POST',
      })
    );

    expect(drainResponse.status).toBe(200);
    const drainBody = (await drainResponse.json()) as {
      ok: boolean;
      processedCount: number;
      completedCount: number;
      failedCount: number;
    };
    expect(drainBody.ok).toBe(true);
    expect(drainBody.processedCount).toBeGreaterThanOrEqual(1);
    expect(drainBody.completedCount).toBe(1);
    expect(drainBody.failedCount).toBe(0);

    const [latestJob] = await db
      .select()
      .from(jobQueue)
      .where(eq(jobQueue.planId, plan.id))
      .orderBy(desc(jobQueue.createdAt))
      .limit(1);

    expect(latestJob?.status).toBe('completed');

    const [updatedPlan] = await db
      .select({ generationStatus: learningPlans.generationStatus })
      .from(learningPlans)
      .where(eq(learningPlans.id, plan.id))
      .limit(1);

    expect(updatedPlan?.generationStatus).toBe('ready');

    const moduleRows = await db
      .select({ id: modules.id })
      .from(modules)
      .where(eq(modules.planId, plan.id));

    expect(moduleRows.length).toBeGreaterThan(0);
  });
});
