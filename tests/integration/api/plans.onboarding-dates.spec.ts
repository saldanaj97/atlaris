import { afterEach, describe, expect, it } from 'vitest';

import { eq } from 'drizzle-orm';

import { POST } from '@/app/api/v1/plans/route';
import { db } from '@/lib/db/service-role';
import { learningPlans, users } from '@/lib/db/schema';
import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';

const BASE_URL = 'http://localhost/api/v1/plans';

async function createRequest(body: unknown) {
  return new Request(BASE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/plans with dates in job payload', () => {
  const authUserId = buildTestAuthUserId('api-dates-user');
  const authEmail = buildTestEmail(authUserId);

  afterEach(async () => {
    await db.delete(learningPlans);
  });

  it('persists startDate and deadlineDate to database when provided', async () => {
    setTestUser(authUserId);
    await ensureUser({
      authUserId,
      email: authEmail,
      subscriptionTier: 'pro',
    });

    const startDate = '2025-11-01';
    const deadlineDate = '2025-12-15';

    const request = await createRequest({
      topic: 'Python Mastery',
      skillLevel: 'intermediate',
      weeklyHours: 5,
      learningStyle: 'practice',
      startDate,
      deadlineDate,
      visibility: 'private',
      origin: 'ai',
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    const payload = await response.json();
    const [plan] = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.id, payload.id));

    expect(plan).toBeDefined();
    expect(plan?.startDate).toBe(startDate);
    expect(plan?.deadlineDate).toBe(deadlineDate);
  });

  it('returns 403 when free tier duration exceeds cap and omits startDate', async () => {
    setTestUser(authUserId);
    await ensureUser({
      authUserId,
      email: authEmail,
      subscriptionTier: 'free',
    });

    const deadlineDate = '2075-12-15'; // far future to pass any future checks

    const request = await createRequest({
      topic: 'Advanced TypeScript',
      skillLevel: 'advanced',
      weeklyHours: 8,
      learningStyle: 'reading',
      deadlineDate,
      visibility: 'private',
      origin: 'ai',
    });

    const response = await POST(request);
    expect(response.status).toBe(403);

    const payload = await response.json();
    expect(payload).toEqual({
      error:
        'free tier limited to 2-week plans. Upgrade to pro for longer plans.',
    });
  });

  it('allows pro tier users to create long-running plans without a startDate', async () => {
    const proAuthUserId = buildTestAuthUserId('api-dates-user-pro');
    const proEmail = buildTestEmail(proAuthUserId);

    setTestUser(proAuthUserId);
    const proUserId = await ensureUser({
      authUserId: proAuthUserId,
      email: proEmail,
    });

    await db
      .update(users)
      .set({ subscriptionTier: 'pro' })
      .where(eq(users.id, proUserId));

    const deadlineDate = '2075-12-15';

    const request = await createRequest({
      topic: 'Advanced TypeScript',
      skillLevel: 'advanced',
      weeklyHours: 8,
      learningStyle: 'reading',
      deadlineDate,
      visibility: 'private',
      origin: 'ai',
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    const payload = await response.json();
    const [plan] = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.id, payload.id));

    expect(plan).toBeDefined();
    expect(plan?.startDate).toBeNull();
    expect(plan?.deadlineDate).toBe(deadlineDate);
  });

  it('accepts dates in ISO format and persists to DB', async () => {
    setTestUser(authUserId);
    await ensureUser({
      authUserId,
      email: authEmail,
      subscriptionTier: 'pro',
    });

    const startDate = '2025-06-01';
    const deadlineDate = '2025-12-31';

    const request = await createRequest({
      topic: 'Web Development Bootcamp',
      skillLevel: 'beginner',
      weeklyHours: 10,
      learningStyle: 'mixed',
      startDate,
      deadlineDate,
      visibility: 'private',
      origin: 'ai',
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    const payload = await response.json();
    const [plan] = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.id, payload.id));

    expect(plan).toBeDefined();
    expect(plan?.startDate).toBe(startDate);
    expect(plan?.deadlineDate).toBe(deadlineDate);
  });
});
