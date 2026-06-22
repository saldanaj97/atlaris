import { listDashboardPlanSummaries } from '@/features/plans/read-projection/service';
import { createTestModule, createTestTask } from '@tests/fixtures/modules';
import { createTestPlan } from '@tests/fixtures/plans';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { describe, expect, it } from 'vitest';

async function createUser(scenario: string): Promise<string> {
  const authUserId = buildTestAuthUserId(`dashboard-plans-${scenario}`);
  return ensureUser({
    authUserId,
    email: buildTestEmail(authUserId),
    subscriptionTier: 'pro',
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
});
