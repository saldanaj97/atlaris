import { afterEach, describe, expect, it } from 'vitest';

import { POST } from '@/app/api/v1/plans/route';
import { db } from '@/lib/db/service-role';
import { generationAttempts, learningPlans } from '@/lib/db/schema';
import { ensureUser } from '../../helpers/db';
import { setTestUser } from '../../helpers/auth';

const BASE_URL = 'http://localhost/api/v1/plans';

async function createRequest(body: unknown) {
  return new Request(BASE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/plans', () => {
  const clerkUserId = 'clerk_post_contract_user';
  const clerkEmail = 'contract-post@example.com';

  afterEach(async () => {
    // ensure we do not leak plans across tests in case truncate hook is bypassed
    await db.delete(learningPlans);
  });

  it('creates a new plan and returns 201 with persisted payload', async () => {
    setTestUser(clerkUserId);
    await ensureUser({ clerkUserId, email: clerkEmail });

    const request = await createRequest({
      topic: 'Applied Machine Learning',
      skillLevel: 'intermediate',
      weeklyHours: 6,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
      notes: 'Focus on notebooks and end-to-end projects.',
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    const payload = await response.json();
    expect(payload).toMatchObject({
      topic: 'Applied Machine Learning',
      skillLevel: 'intermediate',
      weeklyHours: 6,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
    });
    expect(payload).toHaveProperty('id');
    expect(payload).toHaveProperty('createdAt');
  });

  it('returns 400 when validation fails', async () => {
    setTestUser(clerkUserId);
    await ensureUser({ clerkUserId, email: clerkEmail });

    const request = await createRequest({
      skillLevel: 'beginner',
      weeklyHours: -1,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const payload = await response.json();
    expect(payload).toHaveProperty('error');
  });

  it('returns 429 when generation attempts are capped for follow-up requests', async () => {
    setTestUser(clerkUserId);
    const userId = await ensureUser({ clerkUserId, email: clerkEmail });
    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'Capped Plan',
        skillLevel: 'beginner',
        weeklyHours: 4,
        learningStyle: 'reading',
        visibility: 'private',
        origin: 'ai',
      })
      .returning();

    // Insert 3 failure attempts directly to reflect capped state (implementation should block further attempts)
    await db.insert(generationAttempts).values([
      {
        planId: plan.id,
        status: 'failure',
        classification: 'timeout',
        durationMs: 10_000,
        modulesCount: 0,
        tasksCount: 0,
        truncatedTopic: false,
        truncatedNotes: false,
        normalizedEffort: false,
        promptHash: null,
        metadata: null,
      },
      {
        planId: plan.id,
        status: 'failure',
        classification: 'rate_limit',
        durationMs: 8_000,
        modulesCount: 0,
        tasksCount: 0,
        truncatedTopic: false,
        truncatedNotes: false,
        normalizedEffort: false,
        promptHash: null,
        metadata: null,
      },
      {
        planId: plan.id,
        status: 'failure',
        classification: 'validation',
        durationMs: 500,
        modulesCount: 0,
        tasksCount: 0,
        truncatedTopic: false,
        truncatedNotes: false,
        normalizedEffort: false,
        promptHash: null,
        metadata: null,
      },
    ]);

    const request = await createRequest({
      topic: 'New Topic After Cap',
      skillLevel: 'beginner',
      weeklyHours: 2,
      learningStyle: 'reading',
      visibility: 'private',
      origin: 'ai',
    });

    const response = await POST(request);
    expect(response.status).toBe(429);

    const payload = await response.json();
    expect(payload).toMatchObject({ classification: 'capped' });
  });
});
