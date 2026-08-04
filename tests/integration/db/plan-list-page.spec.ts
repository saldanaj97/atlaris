import type {
  PlanListQuery,
  PlanListSort,
} from '@/features/plans/read-projection/types';
import type { PlanSummary } from '@/shared/types/db.types';

import { derivePlanSummaryDisplayStatus } from '@/features/plans/read-projection/selectors';
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
  return {
    page: 1,
    search: '',
    status: 'all',
    sort: 'recommended',
    ...overrides,
  };
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
      not_started: 0,
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
    const activeRemainingTask = await createTestTask({
      moduleId: activeModule.id,
      order: 2,
    });
    await db.insert(taskProgress).values({
      taskId: activeTask.id,
      userId,
      status: 'completed',
    });
    statusFixtures.push({
      expectedFilter: 'active',
      summary: {
        plan: activePlan,
        modules: [activeModule],
        completion: 0.5,
        completedTasks: 1,
        totalTasks: 2,
        totalMinutes:
          activeTask.estimatedMinutes + activeRemainingTask.estimatedMinutes,
        completedMinutes: activeTask.estimatedMinutes,
        completedModules: 0,
        attemptsCount: 0,
      },
    });

    const notStartedPlan = await createTestPlan({
      userId,
      topic: 'Scope Not started',
      generationStatus: 'ready',
      updatedAt: new Date('2026-06-20T18:00:00.000Z'),
    });
    const notStartedModule = await createTestModule({
      planId: notStartedPlan.id,
    });
    const notStartedTask = await createTestTask({
      moduleId: notStartedModule.id,
    });
    statusFixtures.push({
      expectedFilter: 'not_started',
      summary: {
        plan: notStartedPlan,
        modules: [notStartedModule],
        completion: 0,
        completedTasks: 0,
        totalTasks: 1,
        totalMinutes: notStartedTask.estimatedMinutes,
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
    const pausedRemainingTask = await createTestTask({
      moduleId: pausedModule.id,
      order: 2,
    });
    await db.insert(taskProgress).values({
      taskId: pausedTask.id,
      userId,
      status: 'completed',
      updatedAt: new Date('2026-05-01T18:00:00.000Z'),
    });
    statusFixtures.push({
      expectedFilter: 'inactive',
      summary: {
        plan: pausedPlan,
        modules: [pausedModule],
        completion: 0.5,
        completedTasks: 1,
        totalTasks: 2,
        totalMinutes:
          pausedTask.estimatedMinutes + pausedRemainingTask.estimatedMinutes,
        completedMinutes: pausedTask.estimatedMinutes,
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
      not_started: 1,
      active: 1,
      paused: 1,
      completed: 1,
      generating: 1,
      failed: 1,
    });
  });

  it('uses the latest task progress timestamp for partial-plan activity', async () => {
    const userId = await createUser('latest-progress-activity');
    const plan = await createTestPlan({
      userId,
      topic: 'Recently resumed plan',
      generationStatus: 'ready',
      updatedAt: new Date('2026-05-01T18:00:00.000Z'),
    });
    const module = await createTestModule({ planId: plan.id });
    const completedTask = await createTestTask({ moduleId: module.id });
    await createTestTask({ moduleId: module.id, order: 2 });
    const progressUpdatedAt = new Date('2026-06-22T17:30:00.000Z');

    await db.insert(taskProgress).values({
      taskId: completedTask.id,
      userId,
      status: 'completed',
      updatedAt: progressUpdatedAt,
    });

    const page = await getPlansPageForRead({
      userId,
      dbClient: db,
      query: query({ status: 'all' }),
      referenceTimestamp: REFERENCE_TIMESTAMP,
    });

    expect(page.items).toEqual([
      expect.objectContaining({
        id: plan.id,
        status: 'active',
        updatedAt: progressUpdatedAt.toISOString(),
      }),
    ]);
  });

  it('treats in-progress task rows as started plans', async () => {
    const userId = await createUser('in-progress-plan-status');
    const plan = await createTestPlan({
      userId,
      topic: 'Started plan',
      generationStatus: 'ready',
    });
    const module = await createTestModule({ planId: plan.id });
    const task = await createTestTask({ moduleId: module.id });

    await db.insert(taskProgress).values({
      taskId: task.id,
      userId,
      status: 'in_progress',
    });

    const page = await getPlansPageForRead({
      userId,
      dbClient: db,
      query: query({ status: 'all' }),
      referenceTimestamp: REFERENCE_TIMESTAMP,
    });

    expect(page.items).toEqual([
      expect.objectContaining({ id: plan.id, status: 'active' }),
    ]);
  });

  it('keeps non-ready plans with modules out of the not-started bucket', async () => {
    const userId = await createUser('non-ready-modules');
    const generatingPlan = await createTestPlan({
      userId,
      topic: 'Lifecycle Generating With Modules',
      generationStatus: 'generating',
    });
    const generatingModule = await createTestModule({
      planId: generatingPlan.id,
    });
    await createTestTask({ moduleId: generatingModule.id });

    const failedPlan = await createTestPlan({
      userId,
      topic: 'Lifecycle Failed With Modules',
      generationStatus: 'failed',
    });
    const failedModule = await createTestModule({ planId: failedPlan.id });
    await createTestTask({ moduleId: failedModule.id });

    const page = await getPlansPageForRead({
      userId,
      dbClient: db,
      query: query({ search: 'lifecycle' }),
      referenceTimestamp: REFERENCE_TIMESTAMP,
    });
    const byId = new Map(page.items.map((item) => [item.id, item.status]));

    expect(byId.get(generatingPlan.id)).toBe('generating');
    expect(byId.get(failedPlan.id)).toBe('failed');
    expect(page.statusCounts).toMatchObject({
      not_started: 0,
      generating: 1,
      failed: 1,
    });
  });

  it('orders plans by recently updated when sort is recently_updated', async () => {
    const userId = await createUser('sort-recent');
    const older = await createTestPlan({
      userId,
      topic: 'Older Update',
      generationStatus: 'ready',
      createdAt: new Date('2026-05-01T12:00:00.000Z'),
      updatedAt: new Date('2026-05-10T12:00:00.000Z'),
    });
    const newer = await createTestPlan({
      userId,
      topic: 'Newer Update',
      generationStatus: 'ready',
      createdAt: new Date('2026-05-01T12:00:00.000Z'),
      updatedAt: new Date('2026-06-15T12:00:00.000Z'),
    });

    const page = await getPlansPageForRead({
      userId,
      dbClient: db,
      query: query({ sort: 'recently_updated' }),
      referenceTimestamp: REFERENCE_TIMESTAMP,
    });

    expect(page.items.map((item) => item.id)).toEqual([newer.id, older.id]);
  });

  it('orders plans by each sortable table column in both directions', async () => {
    const userId = await createUser('sort-table-columns');
    const complete = await createTestPlan({
      userId,
      topic: 'Alpha Complete',
      generationStatus: 'ready',
      updatedAt: new Date('2026-06-19T12:00:00.000Z'),
    });
    const completeModule = await createTestModule({ planId: complete.id });
    const completeTasks = await Promise.all([
      createTestTask({ moduleId: completeModule.id }),
      createTestTask({ moduleId: completeModule.id, order: 2 }),
    ]);
    await db.insert(taskProgress).values(
      completeTasks.map((task) => ({
        taskId: task.id,
        userId,
        status: 'completed' as const,
        updatedAt: new Date('2026-06-19T12:00:00.000Z'),
      })),
    );

    const notStarted = await createTestPlan({
      userId,
      topic: 'Beta Not Started',
      generationStatus: 'ready',
      updatedAt: new Date('2026-06-20T12:00:00.000Z'),
    });
    const notStartedModule = await createTestModule({ planId: notStarted.id });
    await createTestTask({ moduleId: notStartedModule.id });

    const active = await createTestPlan({
      userId,
      topic: 'Zulu Active',
      generationStatus: 'ready',
      updatedAt: new Date('2026-06-18T12:00:00.000Z'),
    });
    const activeModule = await createTestModule({ planId: active.id });
    const activeTask = await createTestTask({ moduleId: activeModule.id });
    await createTestTask({ moduleId: activeModule.id, order: 2 });
    await db.insert(taskProgress).values({
      taskId: activeTask.id,
      userId,
      status: 'completed',
      updatedAt: new Date('2026-06-18T12:00:00.000Z'),
    });

    const topicsFor = async (sort: PlanListSort): Promise<string[]> => {
      const page = await getPlansPageForRead({
        userId,
        dbClient: db,
        query: query({ sort }),
        referenceTimestamp: REFERENCE_TIMESTAMP,
      });
      return page.items.map((item) => item.topic);
    };

    expect(await topicsFor('topic_asc')).toEqual([
      'Alpha Complete',
      'Beta Not Started',
      'Zulu Active',
    ]);
    expect(await topicsFor('topic_desc')).toEqual([
      'Zulu Active',
      'Beta Not Started',
      'Alpha Complete',
    ]);
    expect(await topicsFor('progress_asc')).toEqual([
      'Beta Not Started',
      'Zulu Active',
      'Alpha Complete',
    ]);
    expect(await topicsFor('progress_desc')).toEqual([
      'Alpha Complete',
      'Zulu Active',
      'Beta Not Started',
    ]);
    expect(await topicsFor('status_asc')).toEqual([
      'Beta Not Started',
      'Zulu Active',
      'Alpha Complete',
    ]);
    expect(await topicsFor('status_desc')).toEqual([
      'Alpha Complete',
      'Zulu Active',
      'Beta Not Started',
    ]);
    expect(await topicsFor('updated_asc')).toEqual([
      'Zulu Active',
      'Alpha Complete',
      'Beta Not Started',
    ]);
  });

  it('orders plans by created date when sort is newest', async () => {
    const userId = await createUser('sort-newest');
    const older = await createTestPlan({
      userId,
      topic: 'Older Created',
      generationStatus: 'ready',
      createdAt: new Date('2026-04-01T12:00:00.000Z'),
      updatedAt: new Date('2026-06-01T12:00:00.000Z'),
    });
    const newer = await createTestPlan({
      userId,
      topic: 'Newer Created',
      generationStatus: 'ready',
      createdAt: new Date('2026-06-01T12:00:00.000Z'),
      updatedAt: new Date('2026-04-01T12:00:00.000Z'),
    });

    const page = await getPlansPageForRead({
      userId,
      dbClient: db,
      query: query({ sort: 'newest' }),
      referenceTimestamp: REFERENCE_TIMESTAMP,
    });

    expect(page.items.map((item) => item.id)).toEqual([newer.id, older.id]);
  });
});
