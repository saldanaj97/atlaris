import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db/users';
import {
  buildTestProcessGenerationInput,
  processTestGenerationAttempt,
} from '../../helpers/process-generation-attempt';
import {
  generationAttempts,
  learningPlans,
  modules,
  tasks,
} from '@supabase/schema';
import { db } from '@supabase/service-role';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const authUserId = 'auth_generation_timeout';
const authEmail = 'generation-timeout@example.com';

describe('generation integration - timeout classification', () => {
  beforeAll(() => {
    vi.stubEnv('AI_PROVIDER', 'mock');
    vi.stubEnv('MOCK_AI_SCENARIO', 'timeout');
    vi.stubEnv('MOCK_GENERATION_DELAY_MS', '0');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('marks attempt as timeout when the mock provider times out', async () => {
    setTestUser(authUserId);
    const userId = await ensureUser({ authUserId, email: authEmail });

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

    const result = await processTestGenerationAttempt(
      buildTestProcessGenerationInput({
        planId: plan.id,
        userId,
        topic: 'Long Running Topic',
        notes: 'Expecting timeout classification',
        skillLevel: 'intermediate',
        weeklyHours: 4,
        learningStyle: 'reading',
      }),
    );

    expect(result.status).toBe('retryable_failure');
    if (result.status === 'retryable_failure') {
      expect(result.classification).toBe('timeout');
    }

    const modulesCount = await db
      .select({ value: modules.id })
      .from(modules)
      .where(eq(modules.planId, plan.id));
    expect(modulesCount.length).toBe(0);

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
    expect(attempt?.classification).toBe('timeout');
    expect(attempt?.modulesCount).toBe(0);
    expect(attempt?.tasksCount).toBe(0);
  });
});
