import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db/users';
import {
  buildTestProcessGenerationInput,
  processTestGenerationAttempt,
} from '../../helpers/process-generation-attempt';
import { generationAttempts, learningPlans } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const authUserId = 'auth_generation_rate_limit';
const authEmail = 'generation-rate-limit@example.com';

describe('generation integration - rate limit classification', () => {
  beforeAll(() => {
    vi.stubEnv('AI_PROVIDER', 'mock');
    vi.stubEnv('MOCK_AI_SCENARIO', 'rate_limit');
    vi.stubEnv('MOCK_GENERATION_DELAY_MS', '0');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('records rate_limit classification when the mock provider signals throttling', async () => {
    setTestUser(authUserId);
    const userId = await ensureUser({ authUserId, email: authEmail });

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'High Demand Topic',
        skillLevel: 'advanced',
        weeklyHours: 8,
        learningStyle: 'reading',
        visibility: 'private',
        origin: 'ai',
      })
      .returning();

    const result = await processTestGenerationAttempt(
      buildTestProcessGenerationInput({
        planId: plan.id,
        userId,
        topic: 'High Demand Topic',
        notes: 'Expecting rate limit classification',
        skillLevel: 'advanced',
        weeklyHours: 8,
        learningStyle: 'reading',
      }),
    );

    expect(result.status).toBe('retryable_failure');
    if (result.status === 'retryable_failure') {
      expect(result.classification).toBe('rate_limit');
    }

    const [attempt] = await db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, plan.id));

    expect(attempt?.status).toBe('failure');
    expect(attempt?.classification).toBe('rate_limit');
    expect(attempt?.modulesCount).toBe(0);
    expect(attempt?.tasksCount).toBe(0);
  });
});
