import { setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db/users';
import {
  buildTestProcessGenerationInput,
  processTestGenerationAttempt,
} from '../../helpers/process-generation-attempt';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';
import {
  generationAttempts,
  learningPlans,
  modules,
  tasks,
} from '@supabase/schema';
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

const authUserId = buildTestAuthUserId('generation-capped');
const authEmail = buildTestEmail(authUserId);

async function seedCappedAttempts(planId: string) {
  await db.insert(generationAttempts).values([
    {
      planId,
      status: 'failure',
      classification: 'timeout',
      durationMs: 10_000,
      modulesCount: 0,
      tasksCount: 0,
      truncatedTopic: false,
      truncatedNotes: false,
      normalizedEffort: false,
      promptHash: null,
      metadata: null,
    },
    {
      planId,
      status: 'failure',
      classification: 'rate_limit',
      durationMs: 8_000,
      modulesCount: 0,
      tasksCount: 0,
      truncatedTopic: false,
      truncatedNotes: false,
      normalizedEffort: false,
      promptHash: null,
      metadata: null,
    },
    {
      planId,
      status: 'failure',
      classification: 'validation',
      durationMs: 500,
      modulesCount: 0,
      tasksCount: 0,
      truncatedTopic: false,
      truncatedNotes: false,
      normalizedEffort: false,
      promptHash: null,
      metadata: null,
    },
  ]);
}

describe('generation integration - capped attempts', () => {
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

  it('returns capped classification and skips provider invocation after three failures', async () => {
    const userId = await ensureUser({ authUserId, email: authEmail });

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'Capped Topic',
        skillLevel: 'beginner',
        weeklyHours: 2,
        learningStyle: 'reading',
        visibility: 'private',
        origin: 'ai',
      })
      .returning();

    await seedCappedAttempts(plan.id);

    const result = await processTestGenerationAttempt(
      buildTestProcessGenerationInput({
        planId: plan.id,
        userId,
        topic: 'Capped Topic',
        notes: 'Should not invoke provider because cap reached',
        skillLevel: 'beginner',
        weeklyHours: 2,
        learningStyle: 'reading',
      }),
    );

    expect(result.status).toBe('permanent_failure');
    if (result.status === 'permanent_failure') {
      expect(result.classification).toBe('capped');
    }

    const attempts = await db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.planId, plan.id))
      .orderBy(desc(generationAttempts.createdAt));

    // Cap rejections are synthetic failures; no new DB row is written.
    expect(attempts).toHaveLength(3);
    expect(
      attempts.some((attempt) => attempt.classification === 'capped'),
    ).toBe(false);

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
  });
});
