import { beforeEach, describe, expect, it } from 'vitest';

import { jobQueue, learningPlans, usageMetrics, users } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';

import { truncateAll } from '../../helpers/db';

describe('truncateAll', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('clears critical tables between integration tests', async () => {
    const uniqueTag = Date.now().toString(36);
    const email = `truncate.${uniqueTag}@example.test`;

    const [user] = await db
      .insert(users)
      .values({
        authUserId: `truncate-${uniqueTag}`,
        email,
        name: 'Truncate Guard',
      })
      .returning({ id: users.id });

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId: user.id,
        topic: 'Test Truncate Plan',
        skillLevel: 'beginner',
        weeklyHours: 1,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
      })
      .returning({ id: learningPlans.id });

    await db.insert(usageMetrics).values({ userId: user.id, month: '2025-01' });

    await db.insert(jobQueue).values({
      planId: plan.id,
      userId: user.id,
      jobType: 'plan_generation',
      payload: { marker: 'truncate' },
      scheduledFor: new Date(),
      priority: 0,
      attempts: 0,
      maxAttempts: 1,
    });

    await truncateAll();

    const usersAfter = await db.select().from(users);
    const plansAfter = await db.select().from(learningPlans);
    const usageAfter = await db.select().from(usageMetrics);
    const jobsAfter = await db.select().from(jobQueue);

    expect(usersAfter).toHaveLength(0);
    expect(plansAfter).toHaveLength(0);
    expect(usageAfter).toHaveLength(0);
    expect(jobsAfter).toHaveLength(0);
  });
});
