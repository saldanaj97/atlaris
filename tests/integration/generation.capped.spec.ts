import { beforeEach, describe, expect, it } from 'vitest';

import { createMockProvider } from '@/lib/ai/mockProvider';
import { runGenerationAttempt } from '@/lib/ai/orchestrator';
import { db } from '@/lib/db/drizzle';
import {
  generationAttempts,
  learningPlans,
  modules,
  tasks,
} from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { setTestUser } from '../helpers/auth';
import { ensureUser } from '../helpers/db';

const clerkUserId = 'clerk_generation_capped';
const clerkEmail = 'generation-capped@example.com';

async function seedCappedAttempts(planId: string) {
  await db.insert(generationAttempts).values([
    {
      planId,
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
      planId,
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
      planId,
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
}

describe('generation integration - capped attempts', () => {
  beforeEach(() => {
    setTestUser(clerkUserId);
  });

  it('records capped classification and skips provider invocation after three failures', async () => {
    const userId = await ensureUser({ clerkUserId, email: clerkEmail });

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'Capped Topic',
        skillLevel: 'beginner',
        weeklyHours: 2,
        learningStyle: 'reading',
        visibility: 'private',
        origin: 'ai',
      })
      .returning();

    await seedCappedAttempts(plan.id);

    const mock = createMockProvider({ scenario: 'success' });

    const result = await runGenerationAttempt(
      {
        planId: plan.id,
        userId,
        input: {
          topic: 'Capped Topic',
          notes: 'Should not invoke provider because cap reached',
          skillLevel: 'beginner',
          weeklyHours: 2,
          learningStyle: 'reading',
        },
      },
      { provider: mock.provider }
    );

    expect(result.status).toBe('failure');
    expect(result.classification).toBe('capped');
    expect(mock.invocationCount).toBe(0);

    const attempts = await db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, plan.id))
      .orderBy(desc(generationAttempts.createdAt));
    const latestAttempt = attempts[0];

    expect(latestAttempt?.classification).toBe('capped');
    expect(latestAttempt?.modulesCount).toBe(0);
    expect(latestAttempt?.tasksCount).toBe(0);

    const moduleRows = await db
      .select({ value: modules.id })
      .from(modules)
      .where(eq(modules.planId, plan.id));
    expect(moduleRows.length).toBe(0);

    const taskRows = await db.select({ value: tasks.id }).from(tasks);
    expect(taskRows.length).toBe(0);
  });
});
