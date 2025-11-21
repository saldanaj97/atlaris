import { db } from '@/lib/db/service-role';
import { aiUsageEvents, learningPlans } from '@/lib/db/schema';
import { recordUsage } from '@/lib/db/usage';
import { atomicCheckAndInsertPlan } from '@/lib/stripe/usage';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { ensureUser } from '../../helpers/db';
import { buildTestClerkUserId, buildTestEmail } from '../../helpers/testIds';

describe('AI usage logging', () => {
  it('atomically checks plan limit, creates plan, and records usage event', async () => {
    const clerkUserId = buildTestClerkUserId('db-usage');
    const userId = await ensureUser({
      clerkUserId,
      email: buildTestEmail(clerkUserId),
    });

    // Check the limit and create the plan in a single atomic transaction
    const plan = await atomicCheckAndInsertPlan(userId, {
      topic: 'Test Topic',
      skillLevel: 'beginner',
      weeklyHours: 5,
      learningStyle: 'mixed',
      visibility: 'private',
      origin: 'ai',
    });

    expect(plan.id).toBeDefined();

    const [planRow] = await db
      .select()
      .from(learningPlans)
      .where(eq(learningPlans.id, plan.id));

    expect(planRow?.generationStatus).toBe('generating');
    expect(planRow?.isQuotaEligible).toBe(false);
    expect(planRow?.finalizedAt).toBeNull();

    await recordUsage({
      userId,
      provider: 'mock',
      model: 'mock-generator-v1',
      inputTokens: 10,
      outputTokens: 100,
      costCents: 0,
      kind: 'plan',
    });

    const rows = await db
      .select()
      .from(aiUsageEvents)
      .where(eq(aiUsageEvents.userId, userId));
    expect(rows.length).toBe(1);
    expect(rows[0]?.provider).toBe('mock');
  });
});
