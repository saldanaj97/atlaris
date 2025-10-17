import { describe, expect, it } from 'vitest';

import { runGenerationAttempt } from '@/lib/ai/orchestrator';
import { db } from '@/lib/db/drizzle';
import {
  generationAttempts,
  learningPlans,
  modules,
  tasks,
} from '@/lib/db/schema';
import { asc, eq, inArray } from 'drizzle-orm';
import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';
import { createMockProvider } from '../../helpers/mockProvider';

const clerkUserId = 'clerk_generation_success';
const clerkEmail = 'generation-success@example.com';

describe('generation integration - success path', () => {
  it('persists modules/tasks and logs a successful attempt', async () => {
    setTestUser(clerkUserId);
    const userId = await ensureUser({ clerkUserId, email: clerkEmail });

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'Deep Learning Foundations',
        skillLevel: 'intermediate',
        weeklyHours: 6,
        learningStyle: 'mixed',
        visibility: 'private',
        origin: 'ai',
      })
      .returning();

    const mock = createMockProvider({ scenario: 'success' });

    const result = await runGenerationAttempt(
      {
        planId: plan.id,
        userId,
        input: {
          topic: 'Deep Learning Foundations',
          notes: 'Focus on practical intuitions and projects',
          skillLevel: 'intermediate',
          weeklyHours: 6,
          learningStyle: 'mixed',
        },
      },
      { provider: mock.provider }
    );

    expect(result.status).toBe('success');
    expect(result.classification).toBeNull();

    const moduleRows = await db
      .select()
      .from(modules)
      .where(eq(modules.planId, plan.id))
      .orderBy(asc(modules.order));

    expect(moduleRows.length).toBeGreaterThan(0);

    const moduleIds = moduleRows.map((module) => module.id);
    const taskRows = moduleIds.length
      ? await db
          .select()
          .from(tasks)
          .where(inArray(tasks.moduleId, moduleIds))
          .orderBy(asc(tasks.order))
      : [];

    expect(taskRows.length).toBeGreaterThan(0);

    const [attempt] = await db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, plan.id));

    expect(attempt?.status).toBe('success');
    expect(attempt?.classification).toBeNull();
    expect(attempt?.modulesCount).toBe(moduleRows.length);
    expect(attempt?.tasksCount).toBe(taskRows.length);
  });
});
