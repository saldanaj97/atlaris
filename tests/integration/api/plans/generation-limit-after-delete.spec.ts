import { DELETE } from '@/app/api/v1/plans/[planId]/route';
import { POST } from '@/app/api/v1/plans/route';
import { clearAllUserRateLimiters } from '@/lib/api/user-rate-limit';
import { PLAN_GENERATION_LIMIT } from '@/shared/constants/generation';
import { generationAttempts, learningPlans } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { setTestUser } from '@tests/helpers/auth';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

let topicCounter = 0;

function createPlanRequest(): Promise<Response> {
  topicCounter += 1;
  return POST(
    new Request('http://localhost/api/v1/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: `Learning TypeScript part ${topicCounter}`,
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'mixed',
        deadlineDate: new Date(Date.now() + TEN_DAYS_MS)
          .toISOString()
          .slice(0, 10),
        visibility: 'private',
        origin: 'ai',
      }),
    }),
  );
}

async function finishRun(planId: string): Promise<void> {
  await db
    .update(generationAttempts)
    .set({ status: 'success' })
    .where(eq(generationAttempts.planId, planId));
  await db
    .update(learningPlans)
    .set({ generationStatus: 'ready' })
    .where(eq(learningPlans.id, planId));
}

describe('hourly generation limit after deleting plans', () => {
  beforeEach(() => {
    clearAllUserRateLimiters();
    vi.stubEnv('JOBS_WORKER_URL', 'https://workers-test.atlaris.app');
    vi.stubEnv('JOBS_SIGNING_SECRET', 'integration-secret');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { accepted: true, instanceId: 'plan-instance' },
          { status: 202 },
        ),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each(['starter', 'pro'] as const)(
    'stops a %s user who deletes each plan, across fresh server instances',
    async (subscriptionTier) => {
      const authUserId = buildTestAuthUserId(
        `limit-delete-${subscriptionTier}`,
      );
      await ensureUser({
        authUserId,
        email: buildTestEmail(authUserId),
        subscriptionTier,
      });
      setTestUser(authUserId);

      const statuses: number[] = [];
      for (let round = 0; round < PLAN_GENERATION_LIMIT + 2; round += 1) {
        // A cleared in-memory limiter models a request landing on a new instance.
        clearAllUserRateLimiters();
        const created = await createPlanRequest();
        statuses.push(created.status);
        if (created.status !== 202) continue;

        const { planId } = (await created.json()) as { planId: string };
        await finishRun(planId);
        const deleted = await DELETE(
          new Request(`http://localhost/api/v1/plans/${planId}`, {
            method: 'DELETE',
          }),
          { params: Promise.resolve({ planId }) },
        );
        expect(deleted.status).toBe(200);
      }

      expect(statuses).toEqual([
        ...Array<number>(PLAN_GENERATION_LIMIT).fill(202),
        429,
        429,
      ]);
    },
    60_000,
  );
});
