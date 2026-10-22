import {
  countGenerationBudgetCutsForModule,
  insertGenerationBudgetCuts,
  sumPlanAiSpendMicrousd,
} from '@/lib/db/queries/plan-ai-budget';
import {
  aiUsageEvents,
  generationAttempts,
  generationBudgetCuts,
  learningPlans,
  planResearch,
  tasks,
} from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createTestModule, createTestTask } from '@tests/fixtures/modules';
import { createTestPlan } from '@tests/fixtures/plans';
import { truncateAll } from '@tests/helpers/db/truncate';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

async function createLessonFixture(suffix: string) {
  const authUserId = buildTestAuthUserId(`budget-${suffix}`);
  const userId = await ensureUser({
    authUserId,
    email: buildTestEmail(authUserId),
  });
  const plan = await createTestPlan({ userId, topic: 'Budget Plan' });
  const module = await createTestModule({ planId: plan.id });
  const task = await createTestTask({ moduleId: module.id });
  return { userId, plan, module, task };
}

function usageEvent(
  userId: string,
  planId: string | null,
  createdAt: string,
  cost: { providerCostMicrousd?: bigint; costCents?: number },
) {
  return {
    userId,
    planId,
    provider: 'openrouter',
    model: 'test/model',
    createdAt: new Date(createdAt),
    ...cost,
  };
}

function successfulAttempt(planId: string, createdAt: string) {
  return {
    planId,
    status: 'success' as const,
    durationMs: 1,
    modulesCount: 1,
    tasksCount: 1,
    createdAt: new Date(createdAt),
  };
}

describe('plan AI budget queries', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('sums usage and research spend since the latest successful attempt', async () => {
    const { userId, plan } = await createLessonFixture('sum');
    const other = await createTestPlan({ userId, topic: 'Other Plan' });
    await db.insert(generationAttempts).values([
      successfulAttempt(plan.id, '2026-10-01T00:00:00.000Z'),
      successfulAttempt(plan.id, '2026-10-02T00:00:00.000Z'),
      {
        ...successfulAttempt(plan.id, '2026-10-03T00:00:00.000Z'),
        status: 'failure' as const,
      },
    ]);
    await db.insert(aiUsageEvents).values([
      // The previous generation.
      usageEvent(userId, plan.id, '2026-10-01T12:00:00.000Z', {
        providerCostMicrousd: BigInt(900_000),
      }),
      usageEvent(userId, plan.id, '2026-10-02T01:00:00.000Z', {
        providerCostMicrousd: BigInt(1_500),
      }),
      // No provider cost: the catalog estimate counts.
      usageEvent(userId, plan.id, '2026-10-02T02:00:00.000Z', {
        costCents: 2,
      }),
      usageEvent(userId, other.id, '2026-10-02T03:00:00.000Z', {
        providerCostMicrousd: BigInt(7_000),
      }),
      usageEvent(userId, null, '2026-10-02T03:00:00.000Z', {
        providerCostMicrousd: BigInt(7_000),
      }),
    ]);
    await db.insert(planResearch).values([
      {
        planId: plan.id,
        brief: 'Old',
        mode: 'fast',
        status: 'ok',
        costMicrousd: 800_000,
        createdAt: new Date('2026-10-01T06:00:00.000Z'),
      },
      {
        planId: plan.id,
        brief: 'Current',
        mode: 'fast',
        status: 'ok',
        costMicrousd: 300,
        createdAt: new Date('2026-10-02T00:30:00.000Z'),
      },
      {
        planId: plan.id,
        brief: 'Unpriced',
        mode: 'fast',
        status: 'ok',
        costMicrousd: null,
        createdAt: new Date('2026-10-02T00:40:00.000Z'),
      },
    ]);

    await expect(sumPlanAiSpendMicrousd(plan.id, db)).resolves.toBe(
      1_500 + 20_000 + 300,
    );
  });

  it('counts all spend when the plan has no successful attempt', async () => {
    const { userId, plan } = await createLessonFixture('no-attempt');
    await db.insert(aiUsageEvents).values(
      usageEvent(userId, plan.id, '2026-10-01T00:00:00.000Z', {
        providerCostMicrousd: BigInt(1_000),
      }),
    );

    await expect(sumPlanAiSpendMicrousd(plan.id, db)).resolves.toBe(1_000);
    await expect(
      sumPlanAiSpendMicrousd('00000000-0000-4000-8000-000000000000', db),
    ).resolves.toBe(0);
  });

  it('records cuts and counts them per module, from a start time', async () => {
    const { plan, module, task } = await createLessonFixture('cuts');
    const cut = {
      planId: plan.id,
      moduleId: module.id,
      taskId: task.id,
      spentMicrousd: 2_000_200,
      ceilingMicrousd: 2_500_000,
    };
    const inserted = await insertGenerationBudgetCuts(
      [
        {
          ...cut,
          step: 'advisor',
          pass: 1,
          createdAt: new Date('2026-10-01T00:00:00.000Z'),
        },
        {
          ...cut,
          step: 'repair',
          pass: 2,
          createdAt: new Date('2026-10-02T00:00:00.000Z'),
        },
      ],
      db,
    );
    expect(inserted).toHaveLength(2);

    await expect(
      countGenerationBudgetCutsForModule(plan.id, module.id, db),
    ).resolves.toBe(2);
    await expect(
      countGenerationBudgetCutsForModule(
        plan.id,
        module.id,
        db,
        new Date('2026-10-01T12:00:00.000Z'),
      ),
    ).resolves.toBe(1);
    await expect(insertGenerationBudgetCuts([], db)).resolves.toEqual([]);
  });

  it('rejects unknown steps and passes outside 1 to 2', async () => {
    const { plan } = await createLessonFixture('checks');
    const base = {
      planId: plan.id,
      spentMicrousd: 0,
      ceilingMicrousd: 50_000,
    };

    await expect(
      db.insert(generationBudgetCuts).values({
        ...base,
        step: 'research' as 'repair',
        pass: 1,
      }),
    ).rejects.toMatchObject({
      cause: { constraint_name: 'generation_budget_cuts_step_valid' },
    });
    for (const pass of [0, 3]) {
      await expect(
        db
          .insert(generationBudgetCuts)
          .values({ ...base, step: 'repair', pass }),
      ).rejects.toMatchObject({
        cause: { constraint_name: 'generation_budget_cuts_pass_range' },
      });
    }
  });

  it('deletes cuts with their lesson and keeps usage events when the plan goes', async () => {
    const { userId, plan, module, task } = await createLessonFixture('cascade');
    await insertGenerationBudgetCuts(
      [
        {
          planId: plan.id,
          moduleId: module.id,
          taskId: task.id,
          step: 'repair',
          pass: 2,
          spentMicrousd: 1,
          ceilingMicrousd: 2,
        },
      ],
      db,
    );
    const [event] = await db
      .insert(aiUsageEvents)
      .values(
        usageEvent(userId, plan.id, '2026-10-01T00:00:00.000Z', {
          costCents: 1,
        }),
      )
      .returning();

    await db.delete(tasks).where(eq(tasks.id, task.id));
    await expect(
      countGenerationBudgetCutsForModule(plan.id, module.id, db),
    ).resolves.toBe(0);

    await db.delete(learningPlans).where(eq(learningPlans.id, plan.id));
    const [kept] = await db
      .select({ planId: aiUsageEvents.planId })
      .from(aiUsageEvents)
      .where(eq(aiUsageEvents.id, event!.id));
    expect(kept).toEqual({ planId: null });
  });
});
