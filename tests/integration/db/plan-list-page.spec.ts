import type { PlanListQuery } from '@/features/plans/read-projection/types';
import type { PlanSummary } from '@/shared/types/db.types';

import { derivePlanSummaryDisplayStatus } from '@/features/plans/read-projection/client';
import { getPlansPageForRead } from '@/features/plans/read-projection/service';
import { generationAttempts, taskProgress } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { createTestModule, createTestTask } from '@tests/fixtures/modules';
import { createTestPlan } from '@tests/fixtures/plans';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { describe, expect, it } from 'vitest';

const REFERENCE_TIMESTAMP = '2026-06-22T18:00:00.000Z';

async function createUser(scenario: string): Promise<string> {
  const authUserId = buildTestAuthUserId(`plan-list-${scenario}`);
  return ensureUser({
    authUserId,
    email: buildTestEmail(authUserId),
    subscriptionTier: 'pro',
  });
}

function query(overrides: Partial<PlanListQuery> = {}): PlanListQuery {
  return { page: 1, search: '', status: 'all', ...overrides };
}

describe('aggregate plans page query', () => {
  it('paginates more than 20 plans with stable non-overlapping ordering and clamps pages', async () => {
    const userId = await createUser('pagination');
    const plans = await Promise.all(
      Array.from({ length: 25 }, (_, index) =>
        createTestPlan({
          userId,
          topic: `Paginated Plan ${index + 1}`,
          generationStatus: 'ready',
          createdAt: new Date(
            `2026-05-${String((index % 5) + 1).padStart(2, '0')}T12:00:00.000Z`,
          ),
        }),
      ),
    );
    await Promise.all(
      plans.map(async (plan) => {
        const module = await createTestModule({ planId: plan.id });
        await createTestTask({ moduleId: module.id });
      }),
    );

    const first = await getPlansPageForRead({
      userId,
      dbClient: db,
      query: query(),
      referenceTimestamp: REFERENCE_TIMESTAMP,
    });
    const second = await getPlansPageForRead({
      userId,
      dbClient: db,
      query: query({ page: 2 }),
      referenceTimestamp: REFERENCE_TIMESTAMP,
    });
    const clamped = await getPlansPageForRead({
      userId,
      dbClient: db,
      query: query({ page: 999 }),
      referenceTimestamp: REFERENCE_TIMESTAMP,
    });

    expect(first).toMatchObject({
      page: 1,
      pageSize: 20,
      totalItems: 25,
      totalPages: 2,
      totalSearchResults: 25,
    });
    expect(first.items).toHaveLength(20);
    expect(second.items).toHaveLength(5);
    expect(clamped.page).toBe(2);
    expect(
      new Set([...first.items, ...second.items].map((item) => item.id)).size,
    ).toBe(25);

    const expectedIds = [...plans]
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          b.id.localeCompare(a.id),
      )
      .map((plan) => plan.id);
    expect([...first.items, ...second.items].map((item) => item.id)).toEqual(
      expectedIds,
    );
  });

  it('uses literal case-insensitive substring search and search-scoped counts', async () => {
    const userId = await createUser('search');
    const literal = await createTestPlan({
      userId,
      topic: 'Learn 100%_Literal SQL',
      generationStatus: 'failed',
    });
    await createTestPlan({
      userId,
      topic: 'Learn 100XXLiteral SQL',
      generationStatus: 'failed',
    });
    await createTestPlan({
      userId,
      topic: 'Unrelated active plan',
      generationStatus: 'ready',
    });

    const page = await getPlansPageForRead({
      userId,
      dbClient: db,
      query: query({ search: '100%_literal' }),
      referenceTimestamp: REFERENCE_TIMESTAMP,
    });

    expect(page.items.map((item) => item.id)).toEqual([literal.id]);
    expect(page.totalSearchResults).toBe(1);
    expect(page.statusCounts).toEqual({
      active: 0,
      paused: 0,
      completed: 0,
      generating: 0,
      failed: 1,
    });
  });

  it('matches selector status rules and filters every plans-page status', async () => {
    const userId = await createUser('statuses');
    const referenceDate = new Date(REFERENCE_TIMESTAMP);
    const statusFixtures: Array<{
      expectedFilter: PlanListQuery['status'];
      summary: PlanSummary;
    }> = [];

    const activePlan = await createTestPlan({
      userId,
      topic: 'Scope Active',
      generationStatus: 'ready',
      updatedAt: new Date('2026-06-20T18:00:00.000Z'),
    });
    const activeModule = await createTestModule({ planId: activePlan.id });
    const activeTask = await createTestTask({ moduleId: activeModule.id });
    statusFixtures.push({
      expectedFilter: 'active',
      summary: {
        plan: activePlan,
        modules: [activeModule],
        completion: 0,
        completedTasks: 0,
        totalTasks: 1,
        totalMinutes: activeTask.estimatedMinutes,
        completedMinutes: 0,
        completedModules: 0,
        attemptsCount: 0,
      },
    });

    const pausedPlan = await createTestPlan({
      userId,
      topic: 'Scope Paused',
      generationStatus: 'ready',
      updatedAt: new Date('2026-05-01T18:00:00.000Z'),
    });
    const pausedModule = await createTestModule({ planId: pausedPlan.id });
    const pausedTask = await createTestTask({ moduleId: pausedModule.id });
    statusFixtures.push({
      expectedFilter: 'inactive',
      summary: {
        plan: pausedPlan,
        modules: [pausedModule],
        completion: 0,
        completedTasks: 0,
        totalTasks: 1,
        totalMinutes: pausedTask.estimatedMinutes,
        completedMinutes: 0,
        completedModules: 0,
        attemptsCount: 0,
      },
    });

    const completedPlan = await createTestPlan({
      userId,
      topic: 'Scope Completed',
      generationStatus: 'ready',
    });
    const completedModule = await createTestModule({
      planId: completedPlan.id,
    });
    const completedTask = await createTestTask({
      moduleId: completedModule.id,
    });
    await db.insert(taskProgress).values({
      taskId: completedTask.id,
      userId,
      status: 'completed',
    });
    statusFixtures.push({
      expectedFilter: 'completed',
      summary: {
        plan: completedPlan,
        modules: [completedModule],
        completion: 1,
        completedTasks: 1,
        totalTasks: 1,
        totalMinutes: completedTask.estimatedMinutes,
        completedMinutes: completedTask.estimatedMinutes,
        completedModules: 1,
        attemptsCount: 0,
      },
    });

    const generatingPlan = await createTestPlan({
      userId,
      topic: 'Scope Generating',
      generationStatus: 'generating',
    });
    statusFixtures.push({
      expectedFilter: 'generating',
      summary: {
        plan: generatingPlan,
        modules: [],
        completion: 0,
        completedTasks: 0,
        totalTasks: 0,
        totalMinutes: 0,
        completedMinutes: 0,
        completedModules: 0,
        attemptsCount: 0,
      },
    });

    const failedPlan = await createTestPlan({
      userId,
      topic: 'Scope Failed',
      generationStatus: 'failed',
    });
    await db.insert(generationAttempts).values({
      planId: failedPlan.id,
      status: 'failure',
      classification: 'provider_error',
      durationMs: 1,
      modulesCount: 0,
      tasksCount: 0,
      truncatedTopic: false,
      truncatedNotes: false,
      normalizedEffort: false,
    });
    statusFixtures.push({
      expectedFilter: 'failed',
      summary: {
        plan: failedPlan,
        modules: [],
        completion: 0,
        completedTasks: 0,
        totalTasks: 0,
        totalMinutes: 0,
        completedMinutes: 0,
        completedModules: 0,
        attemptsCount: 1,
      },
    });

    const all = await getPlansPageForRead({
      userId,
      dbClient: db,
      query: query({ search: 'scope' }),
      referenceTimestamp: REFERENCE_TIMESTAMP,
    });
    const byId = new Map(all.items.map((item) => [item.id, item.status]));
    for (const fixture of statusFixtures) {
      expect(byId.get(fixture.summary.plan.id)).toBe(
        derivePlanSummaryDisplayStatus({
          summary: fixture.summary,
          referenceDate,
        }),
      );
      const filtered = await getPlansPageForRead({
        userId,
        dbClient: db,
        query: query({ search: 'scope', status: fixture.expectedFilter }),
        referenceTimestamp: REFERENCE_TIMESTAMP,
      });
      expect(filtered.items.map((item) => item.id)).toEqual([
        fixture.summary.plan.id,
      ]);
    }

    expect(all.statusCounts).toEqual({
      active: 1,
      paused: 1,
      completed: 1,
      generating: 1,
      failed: 1,
    });
  });
});
