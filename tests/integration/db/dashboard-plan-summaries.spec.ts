import {
  getDashboardPlanData,
  listDashboardPlanSummaries,
} from '@/features/plans/read-projection/service';
import { taskProgress, users } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createTestModule, createTestTask } from '@tests/fixtures/modules';
import { createTestPlan } from '@tests/fixtures/plans';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

async function createUser(
  scenario: string,
  subscriptionTier: 'free' | 'pro' = 'pro',
): Promise<string> {
  const authUserId = buildTestAuthUserId(`dashboard-plans-${scenario}`);
  return ensureUser({
    authUserId,
    email: buildTestEmail(authUserId),
    subscriptionTier,
  });
}

describe('dashboard plan summaries', () => {
  it('hydrates only the 20 most recently updated plans and their related rows', async () => {
    const userId = await createUser('limit');
    const plans = await Promise.all(
      Array.from({ length: 25 }, async (_, index) => {
        const planNumber = index + 1;
        const plan = await createTestPlan({
          userId,
          topic: `Dashboard Plan ${String(planNumber).padStart(2, '0')}`,
          generationStatus: 'ready',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date(
            `2026-06-${String(planNumber).padStart(2, '0')}T12:00:00.000Z`,
          ),
        });
        const module = await createTestModule({
          planId: plan.id,
          title: `Module for ${plan.topic}`,
        });
        await createTestTask({
          moduleId: module.id,
          title: `Task for ${plan.topic}`,
        });
        return plan;
      }),
    );

    const summaries = await listDashboardPlanSummaries({ userId });

    expect(summaries).toHaveLength(20);
    expect(summaries.map((summary) => summary.plan.topic)).toEqual(
      Array.from(
        { length: 20 },
        (_, index) => `Dashboard Plan ${String(25 - index).padStart(2, '0')}`,
      ),
    );
    expect(
      summaries.every(
        (summary) =>
          summary.modules.length === 1 &&
          summary.modules[0]?.title === `Module for ${summary.plan.topic}` &&
          summary.totalTasks === 1,
      ),
    ).toBe(true);

    const returnedIds = new Set(summaries.map((summary) => summary.plan.id));
    const omittedIds = plans.slice(0, 5).map((plan) => plan.id);
    expect(omittedIds.every((id) => !returnedIds.has(id))).toBe(true);
  });

  it('finds an older resumable plan before capping dashboard activity summaries', async () => {
    const userId = await createUser('resume-candidate');
    const now = Date.now();
    const completedPlans = await Promise.all(
      Array.from({ length: 20 }, async (_, index) => {
        const plan = await createTestPlan({
          userId,
          topic: `Completed dashboard plan ${index + 1}`,
          generationStatus: 'ready',
          updatedAt: new Date(now - index * 60_000),
        });
        const module = await createTestModule({ planId: plan.id });
        const task = await createTestTask({ moduleId: module.id });
        await db.insert(taskProgress).values({
          taskId: task.id,
          userId,
          status: 'completed',
        });
        return plan;
      }),
    );
    const resumablePlan = await createTestPlan({
      userId,
      topic: 'Older plan to resume',
      generationStatus: 'ready',
      updatedAt: new Date(now - 21 * 60_000),
    });
    const resumableModule = await createTestModule({
      planId: resumablePlan.id,
    });
    const completedTask = await createTestTask({
      moduleId: resumableModule.id,
    });
    await createTestTask({ moduleId: resumableModule.id, order: 2 });
    await db.insert(taskProgress).values({
      taskId: completedTask.id,
      userId,
      status: 'completed',
    });

    const { summaries, resumePlan } = await getDashboardPlanData({ userId });

    expect(summaries).toHaveLength(20);
    expect(summaries.map((summary) => summary.plan.id)).toEqual(
      completedPlans.map((plan) => plan.id),
    );
    expect(resumePlan?.plan.id).toBe(resumablePlan.id);
  });

  it('resumes the selected Free plan when a locked plan ranks first', async () => {
    const userId = await createUser('resume-selected-free', 'free');
    const selectedPlan = await createTestPlan({
      userId,
      topic: 'Selected plan',
      createdAt: new Date('2026-08-20T00:00:00.000Z'),
      updatedAt: new Date('2026-08-20T00:00:00.000Z'),
    });
    const selectedModule = await createTestModule({ planId: selectedPlan.id });
    await createTestTask({ moduleId: selectedModule.id });

    const lockedPlan = await createTestPlan({
      userId,
      topic: 'Locked newer plan',
      createdAt: new Date('2026-08-21T00:00:00.000Z'),
      updatedAt: new Date('2026-08-21T00:00:00.000Z'),
    });
    const lockedModule = await createTestModule({ planId: lockedPlan.id });
    const lockedTask = await createTestTask({ moduleId: lockedModule.id });
    await db.insert(taskProgress).values({
      taskId: lockedTask.id,
      userId,
      status: 'in_progress',
    });

    const selectedAt = new Date('2026-08-22T00:00:00.000Z');
    await db
      .update(users)
      .set({
        initialPlanGeneratedAt: selectedAt,
        freeAccessPlanId: selectedPlan.id,
        freeAccessPlanSelectedAt: selectedAt,
      })
      .where(eq(users.id, userId));

    const { resumePlan } = await getDashboardPlanData({ userId });

    expect(resumePlan?.plan.id).toBe(selectedPlan.id);
  });
});
