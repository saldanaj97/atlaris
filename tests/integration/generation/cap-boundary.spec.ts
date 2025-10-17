import { beforeEach, describe, expect, it } from 'vitest';

import { runGenerationAttempt } from '@/lib/ai/orchestrator';
import { db } from '@/lib/db/drizzle';
import {
  generationAttempts,
  learningPlans,
  modules,
  tasks,
} from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';
import { createMockProvider } from '../../helpers/mockProvider';

const clerkUserId = 'clerk_generation_cap_boundary';
const clerkEmail = 'generation-cap-boundary@example.com';

async function seedFailureAttempts(planId: string, count: number) {
  const attempts = Array.from({ length: count }, (_, index) => ({
    planId,
    status: 'failure' as const,
    classification: index % 2 === 0 ? 'timeout' : 'validation',
    durationMs: 1_000 + index * 100,
    modulesCount: 0,
    tasksCount: 0,
    truncatedTopic: false,
    truncatedNotes: false,
    normalizedEffort: false,
    promptHash: null,
    metadata: null,
  }));

  await db.insert(generationAttempts).values(attempts);
}

describe('generation integration - attempt cap boundary', () => {
  beforeEach(() => {
    setTestUser(clerkUserId);
  });

  it('allows the third attempt and caps the fourth', async () => {
    const userId = await ensureUser({ clerkUserId, email: clerkEmail });

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'Cap Boundary Topic',
        skillLevel: 'intermediate',
        weeklyHours: 4,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
      })
      .returning();

    await seedFailureAttempts(plan.id, 2);

    const mock = createMockProvider({ scenario: 'success' });

    const thirdAttempt = await runGenerationAttempt(
      {
        planId: plan.id,
        userId,
        input: {
          topic: 'Cap Boundary Topic',
          notes: 'Third attempt should still invoke provider',
          skillLevel: 'intermediate',
          weeklyHours: 4,
          learningStyle: 'mixed',
        },
      },
      { provider: mock.provider }
    );

    expect(thirdAttempt.status).toBe('success');
    expect(thirdAttempt.classification).toBeNull();
    expect(mock.invocationCount).toBe(1);

    const attemptRows = await db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, plan.id))
      .orderBy(desc(generationAttempts.createdAt));

    expect(attemptRows).toHaveLength(3);
    expect(attemptRows[0]?.status).toBe('success');

    const moduleRows = await db
      .select({ value: modules.id })
      .from(modules)
      .where(eq(modules.planId, plan.id));
    expect(moduleRows.length).toBeGreaterThan(0);

    const taskRows = await db
      .select({ value: tasks.id })
      .from(tasks)
      .innerJoin(modules, eq(tasks.moduleId, modules.id))
      .where(eq(modules.planId, plan.id));
    expect(taskRows.length).toBeGreaterThan(0);

    const fourthAttempt = await runGenerationAttempt(
      {
        planId: plan.id,
        userId,
        input: {
          topic: 'Cap Boundary Topic',
          notes: 'Fourth attempt should be capped',
          skillLevel: 'intermediate',
          weeklyHours: 4,
          learningStyle: 'mixed',
        },
      },
      { provider: mock.provider }
    );

    expect(fourthAttempt.status).toBe('failure');
    expect(fourthAttempt.classification).toBe('capped');
    expect(mock.invocationCount).toBe(1);

    const cappedAttempts = await db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, plan.id))
      .orderBy(desc(generationAttempts.createdAt));

    expect(cappedAttempts).toHaveLength(4);
    expect(cappedAttempts[0]?.classification).toBe('capped');
  });
});
