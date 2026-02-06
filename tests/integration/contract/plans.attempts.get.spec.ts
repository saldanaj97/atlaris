import { describe, expect, it } from 'vitest';

import { GET } from '@/app/api/v1/plans/[planId]/attempts/route';
import { db } from '@/lib/db/service-role';
import { generationAttempts, learningPlans } from '@/lib/db/schema';
import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';

function buildRequest(planId: string) {
  return new Request(`http://localhost/api/v1/plans/${planId}/attempts`, {
    method: 'GET',
  });
}

describe('GET /api/v1/plans/:planId/attempts', () => {
  const authId = 'contract-attempts-owner';
  const email = 'attempts-owner@example.com';

  it('returns attempt history for owning user', async () => {
    setTestUser(authId);
    const userId = await ensureUser({ authUserId: authId, email });

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'Attempts Plan',
        skillLevel: 'beginner',
        weeklyHours: 3,
        learningStyle: 'reading',
        visibility: 'private',
        origin: 'ai',
      })
      .returning();

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
        status: 'success',
        classification: null,
        durationMs: 4_200,
        modulesCount: 4,
        tasksCount: 18,
        truncatedTopic: false,
        truncatedNotes: false,
        normalizedEffort: true,
        promptHash: 'hash',
        metadata: {
          input: { topic: { truncated: false, original_length: 20 } },
        } as any,
      },
    ]);

    const response = await GET(buildRequest(plan.id));
    expect(response.status).toBe(200);

    const attempts = await response.json();
    expect(Array.isArray(attempts)).toBe(true);
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toHaveProperty('status');
    expect(attempts[0]).toHaveProperty('durationMs');
  });

  it('returns 404 when plan is not owned', async () => {
    setTestUser('other-owner');
    await ensureUser({
      authUserId: 'other-owner',
      email: 'other@example.com',
    });

    const response = await GET(
      buildRequest('00000000-0000-0000-0000-000000000000')
    );
    expect(response.status).toBe(404);
  });
});
