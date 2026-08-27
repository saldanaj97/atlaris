import { POST } from '@/app/api/v1/plans/[planId]/regenerate/route';
import { getCurrentMonth } from '@/features/billing/usage-metrics';
import { clearAllUserRateLimiters } from '@/lib/api/user-rate-limit';
import { TIER_LIMITS } from '@/shared/constants/tier-limits';
import { jobQueue, usageMetrics } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { seedFailedAttemptsForDurableWindow } from '@tests/fixtures/attempts';
import { createPlan } from '@tests/fixtures/plans';
import { setTestUser } from '@tests/helpers/auth';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { desc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const workflowStartMock = vi.hoisted(() =>
  vi.fn(async () => ({
    runId: 'wrun_regeneration',
    returnValue: Promise.resolve({ kind: 'completed' }),
  })),
);

vi.mock('workflow/api', () => ({ start: workflowStartMock }));

const BASE_URL = 'http://localhost/api/v1/plans';

async function createRequest(planId: string, body: unknown) {
  return {
    request: new Request(`${BASE_URL}/${planId}/regenerate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    context: { params: Promise.resolve({ planId }) },
  };
}

async function countJobsForPlan(planId: string): Promise<number> {
  const jobs = await db
    .select({ id: jobQueue.id })
    .from(jobQueue)
    .where(eq(jobQueue.planId, planId));
  return jobs.length;
}

describe('POST /api/v1/plans/:id/regenerate real boundary', () => {
  beforeEach(() => {
    clearAllUserRateLimiters();
  });

  it('returns 404 and does not enqueue for a plan owned by another user', async () => {
    const authUserId = buildTestAuthUserId('regen-boundary-owner');
    setTestUser(authUserId);
    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'pro',
    });

    const otherAuthUserId = buildTestAuthUserId('regen-boundary-other');
    const otherUserId = await ensureUser({
      authUserId: otherAuthUserId,
      email: buildTestEmail(otherAuthUserId),
      subscriptionTier: 'pro',
    });
    const otherPlan = await createPlan(otherUserId);

    const { request, context } = await createRequest(otherPlan.id, {
      overrides: { skillLevel: 'advanced' },
    });

    const response = await POST(request, context);

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe('Learning plan not found.');
    expect(await countJobsForPlan(otherPlan.id)).toBe(0);
  });

  it('returns 429 and does not enqueue when durable generation window is exhausted', async () => {
    const authUserId = buildTestAuthUserId('regen-boundary-durable');
    setTestUser(authUserId);
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'pro',
    });
    const plan = await createPlan(userId);
    await seedFailedAttemptsForDurableWindow(plan.id, {
      promptHashPrefix: 'regen-boundary-durable',
    });

    const { request, context } = await createRequest(plan.id, {
      overrides: { skillLevel: 'advanced' },
    });

    const response = await POST(request, context);

    expect(response.status).toBe(429);
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    const body = await response.json();
    expect(body.code).toBe('RATE_LIMITED');
    expect(await countJobsForPlan(plan.id)).toBe(0);
  });

  it('returns 403 PLAN_REGENERATION_NOT_INCLUDED for Free and does not enqueue', async () => {
    const authUserId = buildTestAuthUserId('regen-boundary-free');
    setTestUser(authUserId);
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'free',
    });
    const plan = await createPlan(userId);

    const { request, context } = await createRequest(plan.id, {
      overrides: { skillLevel: 'advanced' },
    });

    const response = await POST(request, context);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.code).toBe('PLAN_REGENERATION_NOT_INCLUDED');
    expect(await countJobsForPlan(plan.id)).toBe(0);
  });

  it('returns 403 for merged dates where start is after deadline', async () => {
    const authUserId = buildTestAuthUserId('regen-boundary-reversed-dates');
    setTestUser(authUserId);
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'pro',
    });
    const plan = await createPlan(userId, {
      startDate: '2026-01-01',
      deadlineDate: '2026-02-01',
    });

    const { request, context } = await createRequest(plan.id, {
      overrides: { startDate: '2026-02-02' },
    });

    const response = await POST(request, context);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.code).toBe('PLAN_DURATION_LIMIT_EXCEEDED');
    expect(body.error).toBe(
      'Start date must be on or before the deadline date.',
    );
    expect(await countJobsForPlan(plan.id)).toBe(0);
  });

  it('returns 429 and does not enqueue when monthly regeneration quota is exhausted', async () => {
    const authUserId = buildTestAuthUserId('regen-boundary-quota');
    setTestUser(authUserId);
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'starter',
    });
    const plan = await createPlan(userId);
    await db
      .insert(usageMetrics)
      .values({
        userId,
        month: getCurrentMonth(),
        plansGenerated: 0,
        regenerationsUsed: TIER_LIMITS.starter.monthlyRegenerations,
        exportsUsed: 0,
      })
      .onConflictDoUpdate({
        target: [usageMetrics.userId, usageMetrics.month],
        set: {
          regenerationsUsed: TIER_LIMITS.starter.monthlyRegenerations,
        },
      });

    const { request, context } = await createRequest(plan.id, {
      overrides: { skillLevel: 'advanced' },
    });

    const response = await POST(request, context);

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.code).toBe('REGENERATION_QUOTA_EXCEEDED');
    expect(body.error).toBe(
      'Regeneration quota exceeded for your subscription tier.',
    );
    expect(await countJobsForPlan(plan.id)).toBe(0);
  });

  it('enqueues once and rejects a duplicate active regeneration without a second job', async () => {
    const authUserId = buildTestAuthUserId('regen-boundary-dedupe');
    setTestUser(authUserId);
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
      subscriptionTier: 'pro',
    });
    const plan = await createPlan(userId);

    const firstRequest = await createRequest(plan.id, {
      overrides: { skillLevel: 'advanced' },
    });
    const first = await POST(firstRequest.request, firstRequest.context);

    expect(first.status).toBe(202);
    expect(await countJobsForPlan(plan.id)).toBe(1);

    const secondRequest = await createRequest(plan.id, {
      overrides: { skillLevel: 'beginner' },
    });
    const second = await POST(secondRequest.request, secondRequest.context);
    expect(second.status).toBe(409);
    const secondBody = await second.json();
    expect(secondBody.code).toBe('REGENERATION_ALREADY_QUEUED');

    const jobs = await db
      .select()
      .from(jobQueue)
      .where(eq(jobQueue.planId, plan.id))
      .orderBy(desc(jobQueue.createdAt));

    expect(jobs).toHaveLength(1);
    const [job] = jobs;
    expect(job?.jobType).toBe('plan_regeneration');
    expect(['pending', 'processing']).toContain(job?.status);
  });

  it.each(['2026-2-01', '2026-02-30', '2026-02-01T00:00:00.000Z'])(
    'returns 400 for invalid date override %s',
    async (date) => {
      const authUserId = buildTestAuthUserId(`regen-boundary-invalid-${date}`);
      setTestUser(authUserId);
      const userId = await ensureUser({
        authUserId,
        email: buildTestEmail(authUserId),
        subscriptionTier: 'pro',
      });
      const plan = await createPlan(userId);

      const { request, context } = await createRequest(plan.id, {
        overrides: { deadlineDate: date },
      });

      const response = await POST(request, context);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.error).toBe('Invalid overrides.');
      expect(await countJobsForPlan(plan.id)).toBe(0);
    },
  );
});
