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

const authUserId = 'auth_generation_validation';
const authEmail = 'generation-validation@example.com';

describe('generation integration - validation failure', () => {
  beforeAll(() => {
    vi.stubEnv('AI_PROVIDER', 'mock');
    vi.stubEnv('MOCK_AI_SCENARIO', 'invalid_response');
    vi.stubEnv('MOCK_GENERATION_DELAY_MS', '0');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('records a failed attempt when the mock provider returns invalid JSON', async () => {
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

    const result = await processTestGenerationAttempt(
      buildTestProcessGenerationInput({
        planId: plan.id,
        userId,
        topic: 'Constraint Testing Topic',
        notes: 'Expecting validation failure due to invalid JSON',
        skillLevel: 'beginner',
        weeklyHours: 5,
        learningStyle: 'practice',
      }),
    );

    expect(result.status).toBe('retryable_failure');
    if (result.status === 'retryable_failure') {
      expect(result.classification).toBe('provider_error');
    }

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
    expect(attempt?.classification).toBe('provider_error');
    expect(attempt?.modulesCount).toBe(0);
    expect(attempt?.tasksCount).toBe(0);
  });
});
