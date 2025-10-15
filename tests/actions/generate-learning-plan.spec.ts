import { generateLearningPlan } from '@/app/plans/actions';
import { db } from '@/lib/db/drizzle';
import {
  aiUsageEvents,
  modules,
  tasks,
  usageMetrics,
  users,
} from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

async function ensureUser(): Promise<void> {
  const clerkUserId = process.env.DEV_CLERK_USER_ID || `test-${Date.now()}`;
  const email = `${clerkUserId}@example.com`;
  await db
    .insert(users)
    .values({ clerkUserId, email, name: 'Test' })
    .onConflictDoNothing();
}

describe('Server Action: generateLearningPlan', () => {
  beforeEach(() => {
    process.env.AI_PROVIDER = 'mock';
    process.env.AI_USE_MOCK = 'true';
  });

  it('creates a plan, generates modules/tasks, and persists them', async () => {
    await ensureUser();

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
    await ensureUser();

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
