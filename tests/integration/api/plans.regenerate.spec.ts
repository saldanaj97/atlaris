import { afterEach, describe, expect, it } from 'vitest';

import { desc, eq } from 'drizzle-orm';

import { POST } from '@/app/api/v1/plans/[planId]/regenerate/route';
import { jobQueue, learningPlans, usageMetrics } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';

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
  const authUserId = 'auth_api_regen_user';
  const authEmail = 'api-regen@example.com';

  afterEach(async () => {
    await db.delete(jobQueue);
    await db.delete(learningPlans);
    await db.delete(usageMetrics);
  });

  it('enqueues regeneration with priority', async () => {
    setTestUser(authUserId);
    const userId = await ensureUser({
      authUserId,
      email: authEmail,
      subscriptionTier: 'pro',
    });

    // Create a plan for the user
    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'machine learning',
        skillLevel: 'intermediate',
        weeklyHours: 5,
        learningStyle: 'practice',
        visibility: 'private',
        origin: 'ai',
        generationStatus: 'ready',
        isQuotaEligible: true,
      })
      .returning();

    if (!plan) {
      throw new Error('Failed to create plan');
    }

    const { request, context } = await createRequest(plan.id, {
      overrides: { topic: 'interview prep' },
    });

    const res = await POST(request, context);
    expect(res.status).toBe(202);

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
    const otherAuthUserId = 'auth_api_regen_other';
    const otherUserId = await ensureUser({
      authUserId: otherAuthUserId,
      email: 'api-regen-other@example.com',
    });

    const [otherPlan] = await db
      .insert(learningPlans)
      .values({
        userId: otherUserId,
        topic: 'machine learning',
        skillLevel: 'intermediate',
        weeklyHours: 5,
        learningStyle: 'practice',
        visibility: 'private',
        origin: 'ai',
        generationStatus: 'ready',
        isQuotaEligible: true,
      })
      .returning();

    if (!otherPlan) {
      throw new Error('Failed to create plan');
    }

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

      const [plan] = await db
        .insert(learningPlans)
        .values({
          userId,
          topic: 'machine learning',
          skillLevel: 'intermediate',
          weeklyHours: 5,
          learningStyle: 'practice',
          visibility: 'private',
          origin: 'ai',
          generationStatus: 'ready',
          isQuotaEligible: true,
        })
        .returning();

      if (!plan) {
        throw new Error('Failed to create plan');
      }

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

      const [plan] = await db
        .insert(learningPlans)
        .values({
          userId,
          topic: 'machine learning',
          skillLevel: 'intermediate',
          weeklyHours: 5,
          learningStyle: 'practice',
          visibility: 'private',
          origin: 'ai',
          generationStatus: 'ready',
          isQuotaEligible: true,
        })
        .returning();

      if (!plan) {
        throw new Error('Failed to create plan');
      }

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

      const [plan] = await db
        .insert(learningPlans)
        .values({
          userId,
          topic: 'machine learning',
          skillLevel: 'intermediate',
          weeklyHours: 5,
          learningStyle: 'practice',
          visibility: 'private',
          origin: 'ai',
          generationStatus: 'ready',
          isQuotaEligible: true,
        })
        .returning();

      if (!plan) {
        throw new Error('Failed to create plan');
      }

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

      const [plan] = await db
        .insert(learningPlans)
        .values({
          userId,
          topic: 'machine learning',
          skillLevel: 'intermediate',
          weeklyHours: 5,
          learningStyle: 'practice',
          visibility: 'private',
          origin: 'ai',
          generationStatus: 'ready',
          isQuotaEligible: true,
        })
        .returning();

      if (!plan) {
        throw new Error('Failed to create plan');
      }

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

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'machine learning',
        skillLevel: 'intermediate',
        weeklyHours: 5,
        learningStyle: 'practice',
        visibility: 'private',
        origin: 'ai',
        generationStatus: 'ready',
        isQuotaEligible: true,
      })
      .returning();

    if (!plan) {
      throw new Error('Failed to create plan');
    }

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

  it('deduplicates concurrent regeneration requests for same plan', async () => {
    setTestUser(authUserId);
    const userId = await ensureUser({
      authUserId,
      email: authEmail,
      subscriptionTier: 'pro',
    });

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'machine learning',
        skillLevel: 'intermediate',
        weeklyHours: 5,
        learningStyle: 'practice',
        visibility: 'private',
        origin: 'ai',
        generationStatus: 'ready',
        isQuotaEligible: true,
      })
      .returning();

    if (!plan) {
      throw new Error('Failed to create plan');
    }

    // Send two concurrent regeneration requests; small delay on second to give first
    // a head start so we reliably exercise the dedupe path (second returns existing job id).
    const [res1, res2] = await Promise.all([
      createRequest(plan.id, {
        overrides: { topic: 'interview prep 1' },
      }).then(({ request, context }) => POST(request, context)),
      createRequest(plan.id, {
        overrides: { topic: 'interview prep 2' },
      }).then(async ({ request, context }) => {
        await new Promise((r) => setTimeout(r, 15));
        return POST(request, context);
      }),
    ]);

    // Both requests should succeed
    expect(res1.status).toBe(202);
    expect(res2.status).toBe(202);

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

    // API does not currently signal deduplication in header/body; if it did (e.g.
    // X-Regeneration-Deduplicated or body.deduplicated), assert res2 includes it here.
  });
});
