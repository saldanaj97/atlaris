import { describe, expect, it } from 'vitest';

import { runGenerationAttempt } from '@/lib/ai/orchestrator';
import { db } from '@/lib/db/service-role';
import { generationAttempts, learningPlans } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db';
import { createMockProvider } from '../../helpers/mockProvider';

const authUserId = 'auth_generation_rate_limit';
const authEmail = 'generation-rate-limit@example.com';

describe('generation integration - rate limit classification', () => {
  it('records rate_limit classification when provider signals throttling', async () => {
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

    const mock = createMockProvider({ scenario: 'rate_limit' });

    const result = await runGenerationAttempt(
      {
        planId: plan.id,
        userId,
        input: {
          topic: 'High Demand Topic',
          notes: 'Expecting rate limit classification',
          skillLevel: 'advanced',
          weeklyHours: 8,
          learningStyle: 'reading',
        },
      },
      { provider: mock.provider }
    );

    expect(result.status).toBe('failure');
    expect(result.classification).toBe('rate_limit');
    expect(mock.invocationCount).toBe(1);

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
