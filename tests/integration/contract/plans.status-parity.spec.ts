import { createFailedAttemptsInDb } from '@tests/fixtures/attempts';
import { describe, expect, it } from 'vitest';
import { GET as GET_PLAN_DETAIL } from '@/app/api/v1/plans/[planId]/route';
import { GET as GET_PLAN_STATUS } from '@/app/api/v1/plans/[planId]/status/route';
import { getGenerationAttemptCap } from '@/features/ai/generation-policy';
import { learningPlans, modules } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';

import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';
import { buildTestAuthUserId } from '../../helpers/testIds';

type StatusFixture = {
  generationStatus: 'generating' | 'pending_retry' | 'ready' | 'failed';
  hasModules: boolean;
  attemptsCount?: number;
  expectedStatus: 'processing' | 'pending' | 'failed' | 'ready';
};

async function createPlanFixture(
  userId: string,
  fixture: StatusFixture,
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

  if (fixture.attemptsCount && fixture.attemptsCount > 0) {
    await createFailedAttemptsInDb(plan.id, fixture.attemptsCount);
  }

  return plan.id;
}

describe('Plan status parity contract', () => {
  it('returns matching status between detail and status endpoints', async () => {
    const authUserId = buildTestAuthUserId('status_parity');
    setTestUser(authUserId);
    const userId = await ensureUser({
      authUserId,
      email: 'status-parity@example.com',
    });

    const attemptCap = getGenerationAttemptCap();
    const fixtures: StatusFixture[] = [
      {
        generationStatus: 'generating',
        hasModules: false,
        expectedStatus: 'processing',
      },
      {
        generationStatus: 'generating',
        hasModules: false,
        attemptsCount: attemptCap,
        expectedStatus: 'failed',
      },
      {
        generationStatus: 'pending_retry',
        hasModules: false,
        attemptsCount: 1,
        expectedStatus: 'processing',
      },
      {
        generationStatus: 'pending_retry',
        hasModules: false,
        attemptsCount: attemptCap,
        expectedStatus: 'failed',
      },
      {
        generationStatus: 'failed',
        hasModules: false,
        expectedStatus: 'failed',
      },
      {
        generationStatus: 'ready',
        hasModules: true,
        expectedStatus: 'ready',
      },
      {
        generationStatus: 'generating',
        hasModules: true,
        expectedStatus: 'ready',
      },
      {
        generationStatus: 'failed',
        hasModules: true,
        expectedStatus: 'ready',
      },
      {
        generationStatus: 'ready',
        hasModules: false,
        attemptsCount: attemptCap - 1,
        expectedStatus: 'pending',
      },
      {
        generationStatus: 'ready',
        hasModules: false,
        attemptsCount: attemptCap,
        expectedStatus: 'failed',
      },
    ];

    for (const fixture of fixtures) {
      const planId = await createPlanFixture(userId, fixture);

      const detailResponse = await GET_PLAN_DETAIL(
        new Request(`http://localhost/api/v1/plans/${planId}`, {
          method: 'GET',
        }),
      );
      const statusResponse = await GET_PLAN_STATUS(
        new Request(`http://localhost/api/v1/plans/${planId}/status`, {
          method: 'GET',
        }),
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
      expect(statusBody.status).toBe(fixture.expectedStatus);
    }
  });
});
