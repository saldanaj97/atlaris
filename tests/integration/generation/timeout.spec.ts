import { describe, expect, it } from 'vitest';

import { runGenerationAttempt } from '@/lib/ai/orchestrator';
import { db } from '@/lib/db/drizzle';
import {
  generationAttempts,
  learningPlans,
  modules,
  tasks,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { setTestUser } from '../helpers/auth';
import { ensureUser } from '../helpers/db';
import { createMockProvider } from '../helpers/mockProvider';

const clerkUserId = 'clerk_generation_timeout';
const clerkEmail = 'generation-timeout@example.com';

describe('generation integration - timeout classification', () => {
  it('marks attempt as timeout when provider exceeds deadline', async () => {
    setTestUser(clerkUserId);
    const userId = await ensureUser({ clerkUserId, email: clerkEmail });

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'Long Running Topic',
        skillLevel: 'intermediate',
        weeklyHours: 4,
        learningStyle: 'reading',
        visibility: 'private',
        origin: 'ai',
      })
      .returning();

    const mock = createMockProvider({ scenario: 'timeout' });

    const result = await runGenerationAttempt(
      {
        planId: plan.id,
        userId,
        input: {
          topic: 'Long Running Topic',
          notes: 'Expecting streaming without completion',
          skillLevel: 'intermediate',
          weeklyHours: 4,
          learningStyle: 'reading',
        },
      },
      { provider: mock.provider }
    );

    expect(result.status).toBe('failure');
    expect(result.classification).toBe('timeout');
    expect(mock.invocationCount).toBe(1);

    const modulesCount = await db
      .select({ value: modules.id })
      .from(modules)
      .where(eq(modules.planId, plan.id));
    expect(modulesCount.length).toBe(0);

    const tasksCount = await db.select({ value: tasks.id }).from(tasks);
    expect(tasksCount.length).toBe(0);

    const [attempt] = await db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, plan.id));

    expect(attempt?.status).toBe('failure');
    expect(attempt?.classification).toBe('timeout');
    expect(attempt?.modulesCount).toBe(0);
    expect(attempt?.tasksCount).toBe(0);
  });
});
