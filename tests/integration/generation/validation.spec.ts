import { beforeEach, describe, expect, it } from 'vitest';

import { runGenerationAttempt } from '@/lib/ai/orchestrator';
import {
  generationAttempts,
  learningPlans,
  modules,
  tasks,
} from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { eq } from 'drizzle-orm';
import { setTestUser } from '../../helpers/auth';
import { ensureUser, resetDbForIntegrationTestFile } from '../../helpers/db';
import { createMockProvider } from '../../helpers/mockProvider';

const authUserId = 'auth_generation_validation';
const authEmail = 'generation-validation@example.com';

describe('generation integration - validation failure', () => {
  beforeEach(async () => {
    await resetDbForIntegrationTestFile();
  });

  it('classifies attempt as validation when provider output is empty', async () => {
    setTestUser(authUserId);
    const userId = await ensureUser({ authUserId, email: authEmail });

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
      { provider: mock.provider, dbClient: db }
    );

    expect(result.status).toBe('failure');
    expect(result.classification).toBe('validation');

    const moduleRows = await db
      .select({ value: modules.id })
      .from(modules)
      .where(eq(modules.planId, plan.id));
    expect(moduleRows.length).toBe(0);

    const taskRows = await db
      .select({ value: tasks.id })
      .from(tasks)
      .innerJoin(modules, eq(tasks.moduleId, modules.id))
      .where(eq(modules.planId, plan.id));
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
