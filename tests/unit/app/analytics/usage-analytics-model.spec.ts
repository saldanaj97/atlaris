import type { LightweightPlanSummary } from '@/shared/types/db.types';

import {
  buildUsageAnalyticsModel,
  type UsageAnalyticsModel,
} from '@/app/(app)/analytics/usage/usage-analytics-model';
import { describe, expect, it } from 'vitest';

function planSummary(
  overrides: Partial<LightweightPlanSummary> &
    Pick<LightweightPlanSummary, 'id'>,
): LightweightPlanSummary {
  const { id, ...rest } = overrides;

  return {
    id,
    topic: 'Data structures',
    skillLevel: 'beginner',
    learningStyle: 'mixed',
    visibility: 'private',
    origin: 'ai',
    generationStatus: 'ready',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    completion: 0,
    completedTasks: 0,
    totalTasks: 0,
    totalMinutes: 0,
    completedMinutes: 0,
    completedModules: 0,
    moduleCount: 0,
    ...rest,
  };
}

function pickTotals(model: UsageAnalyticsModel) {
  return {
    planCount: model.planCount,
    completedTasks: model.completedTasks,
    totalTasks: model.totalTasks,
    taskCompletionPercent: model.taskCompletionPercent,
    completedModules: model.completedModules,
    totalModules: model.totalModules,
    moduleCompletionPercent: model.moduleCompletionPercent,
    completedMinutes: model.completedMinutes,
    totalMinutes: model.totalMinutes,
    hasPlans: model.hasPlans,
    hasCompletedWork: model.hasCompletedWork,
  };
}

describe('buildUsageAnalyticsModel', () => {
  it('returns zeroed analytics when no plans exist', () => {
    const model = buildUsageAnalyticsModel([]);

    expect(pickTotals(model)).toEqual({
      planCount: 0,
      completedTasks: 0,
      totalTasks: 0,
      taskCompletionPercent: 0,
      completedModules: 0,
      totalModules: 0,
      moduleCompletionPercent: 0,
      completedMinutes: 0,
      totalMinutes: 0,
      hasPlans: false,
      hasCompletedWork: false,
    });
    expect(model.plans).toEqual([]);
  });

  it('keeps available plan scope when no tasks are completed', () => {
    const model = buildUsageAnalyticsModel([
      planSummary({
        id: 'plan-1',
        totalTasks: 5,
        totalMinutes: 120,
        moduleCount: 2,
      }),
    ]);

    expect(pickTotals(model)).toMatchObject({
      planCount: 1,
      completedTasks: 0,
      totalTasks: 5,
      taskCompletionPercent: 0,
      completedMinutes: 0,
      totalMinutes: 120,
      hasPlans: true,
      hasCompletedWork: false,
    });
  });

  it('aggregates partial progress across multiple plans', () => {
    const model = buildUsageAnalyticsModel([
      planSummary({
        id: 'plan-1',
        topic: 'React',
        completedTasks: 2,
        totalTasks: 5,
        completedModules: 1,
        moduleCount: 3,
        completedMinutes: 40,
        totalMinutes: 120,
      }),
      planSummary({
        id: 'plan-2',
        topic: 'SQL',
        completedTasks: 3,
        totalTasks: 5,
        completedModules: 1,
        moduleCount: 2,
        completedMinutes: 60,
        totalMinutes: 80,
      }),
    ]);

    expect(pickTotals(model)).toMatchObject({
      planCount: 2,
      completedTasks: 5,
      totalTasks: 10,
      taskCompletionPercent: 50,
      completedModules: 2,
      totalModules: 5,
      moduleCompletionPercent: 40,
      completedMinutes: 100,
      totalMinutes: 200,
      hasCompletedWork: true,
    });
    expect(model.plans).toMatchObject([
      {
        topic: 'React',
        taskCompletionPercent: 40,
        moduleCompletionPercent: 33,
      },
      { topic: 'SQL', taskCompletionPercent: 60, moduleCompletionPercent: 50 },
    ]);
  });

  it('counts completed plans and modules from current completion totals', () => {
    const model = buildUsageAnalyticsModel([
      planSummary({
        id: 'plan-1',
        completedTasks: 4,
        totalTasks: 4,
        completedModules: 2,
        moduleCount: 2,
        completedMinutes: 90,
        totalMinutes: 90,
      }),
    ]);

    expect(model.taskCompletionPercent).toBe(100);
    expect(model.moduleCompletionPercent).toBe(100);
    expect(model.plans[0]).toMatchObject({
      completedTasks: 4,
      totalTasks: 4,
      taskCompletionPercent: 100,
      completedModules: 2,
      totalModules: 2,
      moduleCompletionPercent: 100,
    });
  });

  it('uses only currently completed task estimates for completed learning time', () => {
    const model = buildUsageAnalyticsModel([
      planSummary({
        id: 'plan-1',
        completedTasks: 1,
        totalTasks: 4,
        completedMinutes: 25,
        totalMinutes: 140,
      }),
    ]);

    expect(model.completedMinutes).toBe(25);
    expect(model.totalMinutes).toBe(140);
    expect(model.plans[0].completedMinutes).toBe(25);
    expect(model.plans[0].totalMinutes).toBe(140);
  });
});
