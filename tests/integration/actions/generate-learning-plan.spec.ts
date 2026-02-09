import { generateLearningPlan } from '@/app/plans/actions';
import { aiUsageEvents, modules, tasks, usageMetrics } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { eq, inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearTestUser, setTestUser } from '../../helpers/auth';
import { ensureUser, resetDbForIntegrationTestFile } from '../../helpers/db';
import { buildTestAuthUserId, buildTestEmail } from '../../helpers/testIds';

const ORIGINAL = {
  AI_PROVIDER: process.env.AI_PROVIDER,
  AI_USE_MOCK: process.env.AI_USE_MOCK,
  MOCK_GENERATION_FAILURE_RATE: process.env.MOCK_GENERATION_FAILURE_RATE,
};

let authUserId: string;

describe('Server Action: generateLearningPlan', () => {
  beforeEach(async () => {
    await resetDbForIntegrationTestFile();
  });

  beforeEach(() => {
    authUserId = buildTestAuthUserId('generate-learning-plan');
    setTestUser(authUserId);
    process.env.AI_PROVIDER = 'mock';
    process.env.AI_USE_MOCK = 'true';
    // Deflake: ensure mock provider does not randomly fail
    process.env.MOCK_GENERATION_FAILURE_RATE = '0';
  });

  afterEach(() => {
    clearTestUser();
    if (ORIGINAL.AI_PROVIDER === undefined) {
      delete process.env.AI_PROVIDER;
    } else {
      process.env.AI_PROVIDER = ORIGINAL.AI_PROVIDER;
    }
    if (ORIGINAL.AI_USE_MOCK === undefined) {
      delete process.env.AI_USE_MOCK;
    } else {
      process.env.AI_USE_MOCK = ORIGINAL.AI_USE_MOCK;
    }
    if (ORIGINAL.MOCK_GENERATION_FAILURE_RATE === undefined) {
      delete process.env.MOCK_GENERATION_FAILURE_RATE;
    } else {
      process.env.MOCK_GENERATION_FAILURE_RATE =
        ORIGINAL.MOCK_GENERATION_FAILURE_RATE;
    }
  });

  it('creates a plan, generates modules/tasks, and persists them', async () => {
    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });

    const res = await generateLearningPlan({
      topic: 'React',
      skillLevel: 'beginner',
      learningStyle: 'mixed',
      weeklyHours: 4,
      notes: null,
    });

    expect(res.status).toBe('success');
    expect(res.planId).toBeTruthy();

    const planRow = await db.query.learningPlans.findFirst({
      where: (fields, operators) =>
        operators.eq(
          fields.id,
          res.planId ?? '00000000-0000-0000-0000-000000000000'
        ),
    });

    expect(planRow?.generationStatus).toBe('ready');
    expect(planRow?.isQuotaEligible).toBe(true);
    expect(planRow?.finalizedAt).toBeInstanceOf(Date);

    const moduleRows = await db
      .select()
      .from(modules)
      .where(eq(modules.planId, res.planId));
    expect(moduleRows.length).toBeGreaterThan(0);
    const moduleIds = moduleRows.map((m) => m.id);
    const taskRows = await db
      .select()
      .from(tasks)
      .where(inArray(tasks.moduleId, moduleIds));
    expect(taskRows.length).toBeGreaterThan(0);

    const events = await db.select().from(aiUsageEvents);
    expect(events).toHaveLength(1);

    const metrics = await db
      .select()
      .from(usageMetrics)
      .where(eq(usageMetrics.userId, planRow?.userId ?? 'invalid'));
    expect(metrics[0]?.plansGenerated).toBe(1);
  });

  it('marks plan as failed and skips usage on generation failure', async () => {
    await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });

    const originalFailureRate = process.env.MOCK_GENERATION_FAILURE_RATE;
    process.env.MOCK_GENERATION_FAILURE_RATE = '1';

    try {
      const res = await generateLearningPlan({
        topic: 'React failure path',
        skillLevel: 'beginner',
        learningStyle: 'mixed',
        weeklyHours: 4,
        notes: null,
      });

      expect(res.status).toBe('failure');
      expect(res.planId).toBeTruthy();

      const planRow = await db.query.learningPlans.findFirst({
        where: (fields, operators) =>
          operators.eq(
            fields.id,
            res.planId ?? '00000000-0000-0000-0000-000000000000'
          ),
      });

      expect(planRow?.generationStatus).toBe('failed');
      expect(planRow?.isQuotaEligible).toBe(false);
      expect(planRow?.finalizedAt).toBeNull();

      const moduleRows = await db
        .select()
        .from(modules)
        .where(eq(modules.planId, res.planId));
      expect(moduleRows).toHaveLength(0);

      const events = await db.select().from(aiUsageEvents);
      expect(events).toHaveLength(0);

      const metrics = await db
        .select()
        .from(usageMetrics)
        .where(eq(usageMetrics.userId, planRow?.userId ?? 'invalid'));
      expect(metrics).toHaveLength(0);
    } finally {
      process.env.MOCK_GENERATION_FAILURE_RATE = originalFailureRate ?? '0';
    }
  });
});
