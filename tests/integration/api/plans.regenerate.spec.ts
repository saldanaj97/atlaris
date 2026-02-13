import { beforeEach, describe, expect, it, vi } from 'vitest';

import { desc, eq } from 'drizzle-orm';

import { POST } from '@/app/api/v1/plans/[planId]/regenerate/route';
import { clearAllUserRateLimiters } from '@/lib/api/user-rate-limit';
import { jobQueue, usageMetrics } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { seedFailedAttemptsForDurableWindow } from '../../fixtures/attempts';
import { createPlan } from '../../fixtures/plans';
import { setTestUser } from '../../helpers/auth';
import { ensureUser, resetDbForIntegrationTestFile } from '../../helpers/db';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';

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

describe('POST /api/v1/plans/:id/regenerate', () => {
  const authUserId = buildTestAuthUserId('api-regen-user');
  const authEmail = buildTestEmail(authUserId);

  beforeEach(async () => {
    clearAllUserRateLimiters();
    await resetDbForIntegrationTestFile();
  });

  it('enqueues regeneration with priority', async () => {
    setTestUser(authUserId);
    const userId = await ensureUser({
      authUserId,
      email: authEmail,
      subscriptionTier: 'pro',
    });

    const plan = await createPlan(userId);

    const { request, context } = await createRequest(plan.id, {
      overrides: { topic: 'interview prep' },
    });

    const res = await POST(request, context);
    expect(res.status).toBe(202);
    expect(res.headers.get('X-RateLimit-Remaining')).toEqual(
      expect.any(String)
    );

    const body = await res.json();
    expect(body.status).toBe('pending');
    expect(body.generationId).toBe(plan.id);
    expect(body.planId).toBe(plan.id);

    // Verify job was enqueued
    const jobs = await db
      .select()
      .from(jobQueue)
      .where(eq(jobQueue.planId, plan.id))
      .orderBy(desc(jobQueue.createdAt))
      .limit(1);
    const job = jobs[0];

    expect(job).toBeDefined();
    expect(job?.jobType).toBe('plan_regeneration');
    expect(['pending', 'processing']).toContain(job?.status);
    expect(job?.planId).toBe(plan.id);
    expect(job?.userId).toBe(userId);
  });

  it('rejects regeneration for non-existent plan', async () => {
    setTestUser(authUserId);
    await ensureUser({
      authUserId,
      email: authEmail,
    });

    const fakePlanId = '00000000-0000-0000-0000-000000000000';
    const { request, context } = await createRequest(fakePlanId, {
      overrides: { topic: 'interview prep' },
    });

    const res = await POST(request, context);
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toBe('Plan not found');
  });

  it('rejects regeneration for plan owned by different user', async () => {
    setTestUser(authUserId);
    await ensureUser({
      authUserId,
      email: authEmail,
    });

    // Create another user and their plan
    const otherAuthUserId = buildTestAuthUserId('api-regen-other');
    const otherUserId = await ensureUser({
      authUserId: otherAuthUserId,
      email: buildTestEmail(otherAuthUserId),
    });

    const otherPlan = await createPlan(otherUserId);

    // Try to regenerate the other user's plan
    const { request, context } = await createRequest(otherPlan.id, {
      overrides: { topic: 'interview prep' },
    });

    const res = await POST(request, context);
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toBe('Plan not found');
  });

  describe('invalid overrides schema', () => {
    it('rejects topic that is too short', async () => {
      setTestUser(authUserId);
      const userId = await ensureUser({
        authUserId,
        email: authEmail,
      });

      const plan = await createPlan(userId);

      const { request, context } = await createRequest(plan.id, {
        overrides: { topic: 'ab' }, // Too short (< 3 chars)
      });

      const res = await POST(request, context);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe('Invalid overrides.');
    });

    it('rejects invalid weeklyHours', async () => {
      setTestUser(authUserId);
      const userId = await ensureUser({
        authUserId,
        email: authEmail,
      });

      const plan = await createPlan(userId);

      const { request, context } = await createRequest(plan.id, {
        overrides: { weeklyHours: -5 }, // Negative hours
      });

      const res = await POST(request, context);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe('Invalid overrides.');
    });

    it('rejects invalid skillLevel', async () => {
      setTestUser(authUserId);
      const userId = await ensureUser({
        authUserId,
        email: authEmail,
      });

      const plan = await createPlan(userId);

      const { request, context } = await createRequest(plan.id, {
        overrides: { skillLevel: 'expert' }, // Invalid enum value
      });

      const res = await POST(request, context);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe('Invalid overrides.');
    });

    it('rejects extra fields in overrides', async () => {
      setTestUser(authUserId);
      const userId = await ensureUser({
        authUserId,
        email: authEmail,
      });

      const plan = await createPlan(userId);

      const { request, context } = await createRequest(plan.id, {
        overrides: { topic: 'new topic', extraField: 'not allowed' },
      });

      const res = await POST(request, context);
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBe('Invalid overrides.');
    });
  });

  it('rejects regeneration when quota limit exceeded', async () => {
    setTestUser(authUserId);
    const userId = await ensureUser({
      authUserId,
      email: authEmail,
      subscriptionTier: 'free', // Free tier has 5 regenerations/month
    });

    const plan = await createPlan(userId);

    // Use up all 5 regenerations by directly updating usage metrics
    const month = new Date().toISOString().slice(0, 7); // YYYY-MM
    await db
      .insert(usageMetrics)
      .values({
        userId,
        month,
        plansGenerated: 0,
        regenerationsUsed: 5, // Max for free tier
        exportsUsed: 0,
      })
      .onConflictDoUpdate({
        target: [usageMetrics.userId, usageMetrics.month],
        set: { regenerationsUsed: 5 },
      });

    const { request, context } = await createRequest(plan.id, {
      overrides: { topic: 'interview prep' },
    });

    const res = await POST(request, context);
    expect(res.status).toBe(429); // Too Many Requests

    const body = await res.json();
    expect(body.error).toMatch(/regeneration limit|quota/i);
  });

  it('returns 429 when durable generation window limit is exceeded', async () => {
    setTestUser(authUserId);
    const userId = await ensureUser({
      authUserId,
      email: authEmail,
      subscriptionTier: 'pro',
    });

    const plan = await createPlan(userId);

    await seedFailedAttemptsForDurableWindow(plan.id, {
      promptHashPrefix: 'regen-rate-limit',
    });

    const { request, context } = await createRequest(plan.id, {
      overrides: { topic: 'blocked by durable limit' },
    });

    const response = await POST(request, context);
    expect(response.status).toBe(429);
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');

    const body = await response.json();
    expect(body.code).toBe('RATE_LIMITED');
    expect(typeof body.retryAfter).toBe('number');
  });

  it('returns conflict when regeneration is already queued for same plan', async () => {
    setTestUser(authUserId);
    const userId = await ensureUser({
      authUserId,
      email: authEmail,
      subscriptionTier: 'pro',
    });

    const plan = await createPlan(userId);

    const firstRequestPromise = createRequest(plan.id, {
      overrides: { topic: 'interview prep 1' },
    }).then(({ request, context }) => POST(request, context));

    await vi.waitFor(async () => {
      const jobs = await db
        .select()
        .from(jobQueue)
        .where(eq(jobQueue.planId, plan.id));

      expect(jobs.length).toBeGreaterThan(0);
    });

    const res2 = await createRequest(plan.id, {
      overrides: { topic: 'interview prep 2' },
    }).then(({ request, context }) => POST(request, context));
    const res1 = await firstRequestPromise;

    // First request queues the job.
    expect(res1.status).toBe(202);

    // Second request should now be rejected as duplicate active regeneration.
    expect(res2.status).toBe(409);
    const secondBody = await res2.json();
    expect(secondBody.code).toBe('REGENERATION_ALREADY_QUEUED');
    expect(secondBody.details?.jobId).toEqual(expect.any(String));

    // Verify only one active regeneration job was created
    const jobs = await db
      .select()
      .from(jobQueue)
      .where(eq(jobQueue.planId, plan.id))
      .orderBy(desc(jobQueue.createdAt));

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.jobType).toBe('plan_regeneration');
    expect(['pending', 'processing']).toContain(jobs[0]?.status);

    // The single job's payload should contain overrides from whichever request won the race
    type RegenerationPayload = { overrides?: { topic?: string } };
    const payload = jobs[0]?.payload as RegenerationPayload | undefined;
    expect(payload?.overrides?.topic).toBeDefined();
    expect(['interview prep 1', 'interview prep 2']).toContain(
      payload?.overrides?.topic
    );
  });
});
