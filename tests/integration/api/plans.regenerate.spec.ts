import { afterEach, describe, expect, it } from 'vitest';

import { desc, eq } from 'drizzle-orm';

import { POST } from '@/app/api/v1/plans/[planId]/regenerate/route';
import { db } from '@/lib/db/drizzle';
import { jobQueue, learningPlans } from '@/lib/db/schema';
import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';

const BASE_URL = 'http://localhost/api/v1/plans';

async function createRequest(planId: string, body: unknown) {
  return new Request(`${BASE_URL}/${planId}/regenerate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/plans/:id/regenerate', () => {
  const clerkUserId = 'clerk_api_regen_user';
  const clerkEmail = 'api-regen@example.com';

  afterEach(async () => {
    await db.delete(jobQueue);
    await db.delete(learningPlans);
  });

  it('enqueues regeneration with priority', async () => {
    setTestUser(clerkUserId);
    const userId = await ensureUser({
      clerkUserId,
      email: clerkEmail,
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

    const req = await createRequest(plan.id, {
      overrides: { topic: 'interview prep' },
    });

    const res = await POST(req);
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
    expect(job?.status).toBe('pending');
    expect(job?.planId).toBe(plan.id);
    expect(job?.userId).toBe(userId);
  });

  it('rejects regeneration for non-existent plan', async () => {
    setTestUser(clerkUserId);
    await ensureUser({
      clerkUserId,
      email: clerkEmail,
    });

    const fakePlanId = '00000000-0000-0000-0000-000000000000';
    const req = await createRequest(fakePlanId, {
      overrides: { topic: 'interview prep' },
    });

    const res = await POST(req);
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toBe('Plan not found');
  });

  it('rejects regeneration for plan owned by different user', async () => {
    setTestUser(clerkUserId);
    await ensureUser({
      clerkUserId,
      email: clerkEmail,
    });

    // Create another user and their plan
    const otherClerkUserId = 'clerk_api_regen_other';
    const otherUserId = await ensureUser({
      clerkUserId: otherClerkUserId,
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
    const req = await createRequest(otherPlan.id, {
      overrides: { topic: 'interview prep' },
    });

    const res = await POST(req);
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toBe('Plan not found');
  });
});
