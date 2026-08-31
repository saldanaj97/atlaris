import { createFailedAttempts } from '../../fixtures/attempts';
import { createTestPlan } from '../../fixtures/plans';
import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db/users';
import {
  buildTestProcessGenerationInput,
  processTestGenerationAttempt,
} from '../../helpers/process-generation-attempt';
import { generationAttempts, modules, tasks } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { desc, eq } from 'drizzle-orm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const authUserId = 'auth_generation_cap_boundary';
const authEmail = 'generation-cap-boundary@example.com';

async function seedFailureAttempts(planId: string, count: number) {
  const attempts = createFailedAttempts(planId, count);
  await db.insert(generationAttempts).values(attempts);
}

describe('generation integration - attempt cap boundary', () => {
  beforeAll(() => {
    vi.stubEnv('AI_PROVIDER', 'mock');
    vi.stubEnv('MOCK_AI_SCENARIO', 'success');
    vi.stubEnv('MOCK_GENERATION_DELAY_MS', '0');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(async () => {
    setTestUser(authUserId);
  });

  it('allows the third attempt and caps the fourth', async () => {
    const userId = await ensureUser({ authUserId, email: authEmail });

    const plan = await createTestPlan({
      userId,
      topic: 'Cap Boundary Topic',
      skillLevel: 'intermediate',
      weeklyHours: 4,
    });

    await seedFailureAttempts(plan.id, 2);

    const input = buildTestProcessGenerationInput({
      planId: plan.id,
      userId,
      topic: 'Cap Boundary Topic',
      notes: 'Third attempt should still invoke provider',
      skillLevel: 'intermediate',
      weeklyHours: 4,
      learningStyle: 'mixed',
    });

    const thirdAttempt = await processTestGenerationAttempt(input);

    expect(thirdAttempt.status).toBe('generation_success');

    const attemptRows = await db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, plan.id))
      .orderBy(desc(generationAttempts.createdAt));

    expect(attemptRows).toHaveLength(3);
    expect(attemptRows[0]?.status).toBe('success');

    const moduleRows = await db
      .select()
      .from(modules)
      .where(eq(modules.planId, plan.id));
    expect(moduleRows.length).toBeGreaterThan(0);

    const taskRows = await db
      .select()
      .from(tasks)
      .innerJoin(modules, eq(tasks.moduleId, modules.id))
      .where(eq(modules.planId, plan.id));
    expect(taskRows.length).toBeGreaterThan(0);

    const fourthAttempt = await processTestGenerationAttempt({
      ...input,
      input: {
        ...input.input,
        notes: 'Fourth attempt should be capped',
      },
    });

    expect(fourthAttempt.status).toBe('permanent_failure');
    if (fourthAttempt.status === 'permanent_failure') {
      expect(fourthAttempt.classification).toBe('capped');
    }

    const cappedAttempts = await db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, plan.id))
      .orderBy(desc(generationAttempts.createdAt));

    // Cap rejection is synthetic; no fourth attempt row is persisted.
    expect(cappedAttempts).toHaveLength(3);
    expect(
      cappedAttempts.some((attempt) => attempt.classification === 'capped'),
    ).toBe(false);
  });
});
