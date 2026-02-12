import { POST } from '@/app/api/v1/plans/[planId]/retry/route';
import { learningPlans } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { describe, expect, it, vi } from 'vitest';

import { seedFailedAttemptsForDurableWindow } from '../../fixtures/attempts';
import { setTestUser } from '../../helpers/auth';
import { ensureUser, resetDbForIntegrationTestFile } from '../../helpers/db';

describe('POST /api/v1/plans/:planId/retry', () => {
  it('applies durable generation_attempts rate limit before retry starts', async () => {
    await resetDbForIntegrationTestFile();

    const authUserId = 'auth_retry_rate_limit';
    setTestUser(authUserId);
    const userId = await ensureUser({
      authUserId,
      email: 'retry-rate-limit@example.com',
    });

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'Retry me',
        skillLevel: 'beginner',
        weeklyHours: 4,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
        generationStatus: 'failed',
      })
      .returning({ id: learningPlans.id });

    if (!plan) {
      throw new Error('Expected plan to be created for retry test.');
    }

    await seedFailedAttemptsForDurableWindow(plan.id);

    const orchestrator = await import('@/lib/ai/orchestrator');
    const runSpy = vi.spyOn(orchestrator, 'runGenerationAttempt');

    try {
      const request = new Request(
        `http://localhost/api/v1/plans/${plan.id}/retry`,
        {
          method: 'POST',
        }
      );

      const response = await POST(request);
      expect(response.status).toBe(429);
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');

      const body = (await response.json()) as {
        code?: string;
        retryAfter?: number;
      };

      expect(body.code).toBe('RATE_LIMITED');
      expect(typeof body.retryAfter).toBe('number');
      expect(runSpy).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });
});
