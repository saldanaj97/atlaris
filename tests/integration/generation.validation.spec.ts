import { describe, expect, it } from 'vitest';

import { createMockProvider } from '@/lib/ai/mockProvider';
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

const clerkUserId = 'clerk_generation_validation';
const clerkEmail = 'generation-validation@example.com';

describe('generation integration - validation failure', () => {
  it('classifies attempt as validation when provider output is empty', async () => {
    setTestUser(clerkUserId);
    const userId = await ensureUser({ clerkUserId, email: clerkEmail });

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'Constraint Testing Topic',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'practice',
        visibility: 'private',
        origin: 'ai',
      })
      .returning();

    const mock = createMockProvider({ scenario: 'validation' });

    const result = await runGenerationAttempt(
      {
        planId: plan.id,
        userId,
        input: {
          topic: 'Constraint Testing Topic',
          notes: 'Expecting validation failure due to zero modules',
          skillLevel: 'beginner',
          weeklyHours: 5,
          learningStyle: 'practice',
        },
      },
      { provider: mock.provider }
    );

    expect(result.status).toBe('failure');
    expect(result.classification).toBe('validation');

    const moduleRows = await db
      .select({ value: modules.id })
      .from(modules)
      .where(eq(modules.planId, plan.id));
    expect(moduleRows.length).toBe(0);

    const taskRows = await db.select({ value: tasks.id }).from(tasks);
    expect(taskRows.length).toBe(0);

    const [attempt] = await db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, plan.id));

    expect(attempt?.status).toBe('failure');
    expect(attempt?.classification).toBe('validation');
    expect(attempt?.modulesCount).toBe(0);
    expect(attempt?.tasksCount).toBe(0);
  });
});
