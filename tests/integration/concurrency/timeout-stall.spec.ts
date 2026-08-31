import { createTestPlan } from '../../fixtures/plans';
import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db/users';
import {
  buildTestProcessGenerationInput,
  processTestGenerationAttempt,
} from '../../helpers/process-generation-attempt';
import { generationAttempts } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Uses the production lifecycle interface with MOCK_AI_SCENARIO=timeout.
 * The mock provider rejects immediately with ProviderTimeoutError.
 */

describe('Concurrency - provider stall timeout classification', () => {
  beforeAll(() => {
    vi.stubEnv('AI_PROVIDER', 'mock');
    vi.stubEnv('MOCK_AI_SCENARIO', 'timeout');
    vi.stubEnv('MOCK_GENERATION_DELAY_MS', '0');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('classifies stalled provider as timeout', async () => {
    setTestUser('stall_user');
    const userId = await ensureUser({
      authUserId: 'stall_user',
      email: 'stall_user@example.com',
    });

    const plan = await createTestPlan({
      userId,
      topic: 'Stall Plan',
      skillLevel: 'beginner',
      weeklyHours: 2,
      learningStyle: 'reading',
      visibility: 'private',
      origin: 'ai',
    });

    const result = await processTestGenerationAttempt(
      buildTestProcessGenerationInput({
        planId: plan.id,
        userId,
        topic: 'Stall Plan',
        notes: 'Expect timeout classification',
        skillLevel: 'beginner',
        weeklyHours: 2,
        learningStyle: 'reading',
      }),
    );

    expect(result.status).toBe('retryable_failure');
    if (result.status === 'retryable_failure') {
      expect(result.classification).toBe('timeout');
    }

    const [attempt] = await db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, plan.id));
    expect(attempt?.status).toBe('failure');
    expect(attempt?.classification).toBe('timeout');
  });
});
