import { GET as GET_PLAN_DETAIL } from '@/app/api/v1/plans/[planId]/route';
import { GET as GET_PLAN_STATUS } from '@/app/api/v1/plans/[planId]/status/route';
import { learningPlans, modules } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { beforeEach, describe, expect, it } from 'vitest';

import { setTestUser } from '../../helpers/auth';
import { ensureUser, resetDbForIntegrationTestFile } from '../../helpers/db';
import { buildTestAuthUserId } from '../../helpers/testIds';

type StatusFixture = {
  generationStatus: 'generating' | 'ready' | 'failed';
  hasModules: boolean;
};

async function createPlanFixture(
  userId: string,
  fixture: StatusFixture
): Promise<string> {
  const [plan] = await db
    .insert(learningPlans)
    .values({
      userId,
      topic: `Parity fixture ${fixture.generationStatus}`,
      skillLevel: 'beginner',
      weeklyHours: 4,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
      generationStatus: fixture.generationStatus,
    })
    .returning({ id: learningPlans.id });

  if (!plan) {
    throw new Error('Expected test plan to be created.');
  }

  if (fixture.hasModules) {
    await db.insert(modules).values({
      planId: plan.id,
      order: 1,
      title: 'Fixture Module',
      description: 'Fixture module for status parity.',
      estimatedMinutes: 60,
    });
  }

  return plan.id;
}

describe('Plan status parity contract', () => {
  beforeEach(async () => {
    await resetDbForIntegrationTestFile();
  });

  it('returns matching status between detail and status endpoints', async () => {
    const authUserId = buildTestAuthUserId('status_parity');
    setTestUser(authUserId);
    const userId = await ensureUser({
      authUserId,
      email: 'status-parity@example.com',
    });

    const fixtures: StatusFixture[] = [
      { generationStatus: 'generating', hasModules: false },
      { generationStatus: 'failed', hasModules: false },
      { generationStatus: 'ready', hasModules: true },
      { generationStatus: 'generating', hasModules: true },
    ];

    for (const fixture of fixtures) {
      const planId = await createPlanFixture(userId, fixture);

      const detailResponse = await GET_PLAN_DETAIL(
        new Request(`http://localhost/api/v1/plans/${planId}`, {
          method: 'GET',
        })
      );
      const statusResponse = await GET_PLAN_STATUS(
        new Request(`http://localhost/api/v1/plans/${planId}/status`, {
          method: 'GET',
        })
      );

      expect(detailResponse.status).toBe(200);
      expect(statusResponse.status).toBe(200);

      const detailBody = (await detailResponse.json()) as {
        status: string;
      };
      const statusBody = (await statusResponse.json()) as {
        status: string;
      };

      expect(detailBody.status).toBe(statusBody.status);
    }
  });
});
