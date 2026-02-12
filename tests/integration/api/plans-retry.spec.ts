import { POST } from '@/app/api/v1/plans/[planId]/retry/route';
import { generationAttempts, learningPlans } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { describe, expect, it, vi } from 'vitest';

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

    await db.insert(generationAttempts).values(
      Array.from({ length: 10 }, () => ({
        planId: plan.id,
        status: 'failure' as const,
        classification: 'timeout',
        durationMs: 1_000,
        modulesCount: 0,
        tasksCount: 0,
        truncatedTopic: false,
        truncatedNotes: false,
        normalizedEffort: false,
        promptHash: null,
        metadata: null,
      }))
    );

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
