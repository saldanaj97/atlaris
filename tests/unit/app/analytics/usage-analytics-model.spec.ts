import type { LightweightPlanSummary } from '@/shared/types/db.types';

import {
  buildUsageAnalyticsModel,
  PULSE_PLAN_LIMIT,
  selectMostActivePlans,
  pointLabelPlacements,
  yAxisTicksForMax,
  type UsageAnalyticsActivityEvent,
  type UsageAnalyticsModel,
  type UsageAnalyticsPlanRow,
} from '@/app/(app)/analytics/usage/usage-analytics-model';
import { describe, expect, it } from 'vitest';

/** Builds a lightweight plan summary fixture with sensible defaults. */
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

/** Extracts aggregate completion totals from a usage analytics model. */
function pickTotals(model: UsageAnalyticsModel) {
  return {
    completedTasks: model.completedTasks,
    totalTasks: model.totalTasks,
    taskCompletionPercent: model.taskCompletionPercent,
    completedModules: model.completedModules,
    totalModules: model.totalModules,
    moduleCompletionPercent: model.moduleCompletionPercent,
    completedMinutes: model.completedMinutes,
    totalMinutes: model.totalMinutes,
  };
}

/** Builds a learning activity event fixture with defaults. */
function activityEvent(
  overrides: Partial<UsageAnalyticsActivityEvent>,
): UsageAnalyticsActivityEvent {
  return {
    planId: 'plan-1',
    status: 'in_progress',
    taskEstimatedMinutes: 30,
    occurredAt: new Date('2026-06-25T12:00:00.000Z'),
    ...overrides,
  };
}

describe('buildUsageAnalyticsModel', () => {
  it('returns zeroed analytics when no plans exist', () => {
    const model = buildUsageAnalyticsModel([]);

    expect(pickTotals(model)).toEqual({
      completedTasks: 0,
      totalTasks: 0,
      taskCompletionPercent: 0,
      completedModules: 0,
      totalModules: 0,
      moduleCompletionPercent: 0,
      completedMinutes: 0,
      totalMinutes: 0,
    });
    expect(model.plans).toEqual([]);
    expect(model.history.hasActivity).toBe(false);
    expect(model.history.currentStreakDays).toBe(0);
    expect(model.history.longestStreakDays).toBe(0);
  });

  it('treats pulse activity as empty when events fall outside the eight-week window', () => {
    const model = buildUsageAnalyticsModel([planSummary({ id: 'plan-1' })], {
      referenceDate: new Date('2026-06-25T12:00:00.000Z'),
      activityEvents: [
        activityEvent({
          occurredAt: new Date('2026-01-02T12:00:00.000Z'),
        }),
      ],
    });

    expect(model.history.hasActivity).toBe(false);
    expect(
      model.history.weeklyTrends.every((row) => row.progressChangeCount === 0),
    ).toBe(true);
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
      completedTasks: 0,
      totalTasks: 5,
      taskCompletionPercent: 0,
      completedMinutes: 0,
      totalMinutes: 120,
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
      completedTasks: 5,
      totalTasks: 10,
      taskCompletionPercent: 50,
      completedModules: 2,
      totalModules: 5,
      moduleCompletionPercent: 40,
      completedMinutes: 100,
      totalMinutes: 200,
    });
    expect(model.plans.map((plan) => plan.topic)).toEqual(['React', 'SQL']);
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
  });

  it('does not round incomplete progress up to complete', () => {
    const model = buildUsageAnalyticsModel([
      planSummary({
        id: 'plan-1',
        completedTasks: 199,
        totalTasks: 200,
        completedModules: 1,
        moduleCount: 2,
      }),
    ]);

    expect(model.taskCompletionPercent).toBe(99);
    expect(model.moduleCompletionPercent).toBe(50);
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
  });

  it('buckets activity days in the analytics timezone', () => {
    const model = buildUsageAnalyticsModel([planSummary({ id: 'plan-1' })], {
      analyticsTimezone: 'America/Chicago',
      referenceDate: new Date('2026-06-25T12:00:00.000Z'),
      activityEvents: [
        activityEvent({
          occurredAt: new Date('2026-06-25T04:30:00.000Z'),
        }),
        activityEvent({
          occurredAt: new Date('2026-06-25T05:30:00.000Z'),
        }),
      ],
    });

    expect(model.history.currentStreakDays).toBe(2);
    expect(model.history.currentWeek.activeDays).toBe(2);
  });

  it('counts the current streak through yesterday when today has no activity', () => {
    const model = buildUsageAnalyticsModel([planSummary({ id: 'plan-1' })], {
      referenceDate: new Date('2026-06-25T12:00:00.000Z'),
      activityEvents: [
        activityEvent({
          occurredAt: new Date('2026-06-24T12:00:00.000Z'),
        }),
      ],
    });

    expect(model.history.currentStreakDays).toBe(1);
  });

  it('tracks broken streaks and longest streaks independently', () => {
    const model = buildUsageAnalyticsModel([planSummary({ id: 'plan-1' })], {
      referenceDate: new Date('2026-06-25T12:00:00.000Z'),
      activityEvents: [
        activityEvent({
          occurredAt: new Date('2026-06-21T12:00:00.000Z'),
        }),
        activityEvent({
          occurredAt: new Date('2026-06-22T12:00:00.000Z'),
        }),
        activityEvent({
          occurredAt: new Date('2026-06-24T12:00:00.000Z'),
        }),
      ],
    });

    expect(model.history.currentStreakDays).toBe(1);
    expect(model.history.longestStreakDays).toBe(2);
  });

  it('counts global streak days across plans', () => {
    const model = buildUsageAnalyticsModel(
      [
        planSummary({ id: 'plan-1', topic: 'React' }),
        planSummary({ id: 'plan-2', topic: 'SQL' }),
      ],
      {
        referenceDate: new Date('2026-06-25T12:00:00.000Z'),
        activityEvents: [
          activityEvent({
            planId: 'plan-1',
            occurredAt: new Date('2026-06-24T12:00:00.000Z'),
          }),
          activityEvent({
            planId: 'plan-2',
            occurredAt: new Date('2026-06-24T12:00:00.000Z'),
          }),
          activityEvent({
            planId: 'plan-2',
            occurredAt: new Date('2026-06-25T12:00:00.000Z'),
          }),
        ],
      },
    );

    expect(model.history.currentStreakDays).toBe(2);
  });

  it('builds Monday-start weekly trend rows', () => {
    const model = buildUsageAnalyticsModel([planSummary({ id: 'plan-1' })], {
      referenceDate: new Date('2026-06-25T12:00:00.000Z'),
      activityEvents: [
        activityEvent({
          occurredAt: new Date('2026-06-21T12:00:00.000Z'),
        }),
        activityEvent({
          occurredAt: new Date('2026-06-22T12:00:00.000Z'),
        }),
        activityEvent({
          occurredAt: new Date('2026-06-28T12:00:00.000Z'),
        }),
      ],
    });

    expect(model.history.weeklyTrends).toHaveLength(8);
    expect(model.history.currentWeek).toMatchObject({
      weekStartDate: '2026-06-22',
      activeDays: 2,
      progressChangeCount: 2,
    });
  });

  it('builds separate weekly trend rows for each plan', () => {
    const model = buildUsageAnalyticsModel(
      [
        planSummary({ id: 'plan-1', topic: 'React' }),
        planSummary({ id: 'plan-2', topic: 'SQL' }),
      ],
      {
        referenceDate: new Date('2026-06-25T12:00:00.000Z'),
        activityEvents: [
          activityEvent({
            planId: 'plan-1',
            occurredAt: new Date('2026-06-17T12:00:00.000Z'),
          }),
          activityEvent({
            planId: 'plan-2',
            occurredAt: new Date('2026-06-24T12:00:00.000Z'),
          }),
          activityEvent({
            planId: 'plan-2',
            occurredAt: new Date('2026-06-25T12:00:00.000Z'),
          }),
        ],
      },
    );

    const react = model.plans.find((plan) => plan.topic === 'React');
    const sql = model.plans.find((plan) => plan.topic === 'SQL');

    expect(
      react?.weeklyTrends.find((week) => week.weekStartDate === '2026-06-15'),
    ).toMatchObject({ progressChangeCount: 1 });
    expect(
      react?.weeklyTrends.find((week) => week.weekStartDate === '2026-06-22'),
    ).toMatchObject({ progressChangeCount: 0 });
    expect(
      sql?.weeklyTrends.find((week) => week.weekStartDate === '2026-06-22'),
    ).toMatchObject({ progressChangeCount: 2 });
  });

  it('keeps uncomplete and recomplete events in historical summaries', () => {
    const model = buildUsageAnalyticsModel([planSummary({ id: 'plan-1' })], {
      referenceDate: new Date('2026-06-25T12:00:00.000Z'),
      activityEvents: [
        activityEvent({
          status: 'completed',
          taskEstimatedMinutes: 25,
          occurredAt: new Date('2026-06-23T12:00:00.000Z'),
        }),
        activityEvent({
          status: 'in_progress',
          taskEstimatedMinutes: 25,
          occurredAt: new Date('2026-06-24T12:00:00.000Z'),
        }),
        activityEvent({
          status: 'completed',
          taskEstimatedMinutes: 25,
          occurredAt: new Date('2026-06-25T12:00:00.000Z'),
        }),
      ],
    });

    expect(model.history.currentWeek).toMatchObject({
      activeDays: 3,
      progressChangeCount: 3,
      completedEvents: 2,
      estimatedCompletionAddedMinutes: 50,
    });
  });

  it('sums estimated completion added only from completed-status events', () => {
    const model = buildUsageAnalyticsModel([planSummary({ id: 'plan-1' })], {
      referenceDate: new Date('2026-06-25T12:00:00.000Z'),
      activityEvents: [
        activityEvent({
          status: 'completed',
          taskEstimatedMinutes: 40,
        }),
        activityEvent({
          status: 'in_progress',
          taskEstimatedMinutes: 80,
        }),
      ],
    });

    expect(model.history.currentWeek.completedEvents).toBe(1);
    expect(model.history.currentWeek.estimatedCompletionAddedMinutes).toBe(40);
  });
});

/** Builds a pulse plan row whose weeks carry the given progress-change counts. */
function pulsePlan(id: string, weeklyCounts: number[]): UsageAnalyticsPlanRow {
  return {
    id,
    topic: `Plan ${id}`,
    weeklyTrends: weeklyCounts.map((progressChangeCount, index) => ({
      weekStartDate: `2026-09-${String(index * 7 + 1).padStart(2, '0')}`,
      label: `Week ${index + 1}`,
      activeDays: progressChangeCount > 0 ? 1 : 0,
      progressChangeCount,
      completedEvents: 0,
      estimatedCompletionAddedMinutes: 0,
      isCurrentWeek: false,
    })),
  };
}

describe('selectMostActivePlans', () => {
  it('keeps the five plans with the most progress changes, most active first', () => {
    const plans = [
      pulsePlan('a', [1, 0]),
      pulsePlan('b', [4, 4]),
      pulsePlan('c', [0, 0]),
      pulsePlan('d', [2, 3]),
      pulsePlan('e', [6, 0]),
      pulsePlan('f', [0, 3]),
      pulsePlan('g', [0, 2]),
    ];

    expect(PULSE_PLAN_LIMIT).toBe(5);
    expect(selectMostActivePlans(plans).map((plan) => plan.id)).toEqual([
      'b',
      'e',
      'd',
      'f',
      'g',
    ]);
  });

  it('breaks ties by the incoming order', () => {
    const plans = [
      pulsePlan('first', [2]),
      pulsePlan('second', [2]),
      pulsePlan('third', [3]),
    ];

    expect(selectMostActivePlans(plans, 2).map((plan) => plan.id)).toEqual([
      'third',
      'first',
    ]);
  });

  it('keeps every plan when there are five or fewer', () => {
    const plans = [pulsePlan('a', [0]), pulsePlan('b', [1])];

    expect(selectMostActivePlans(plans)).toEqual([plans[1], plans[0]]);
  });
});

describe('yAxisTicksForMax', () => {
  it('steps evenly instead of appending an off-step maximum', () => {
    expect(yAxisTicksForMax(7)).toEqual([0, 2, 4, 6, 8]);
    expect(yAxisTicksForMax(9)).toEqual([0, 3, 6, 9]);
    expect(yAxisTicksForMax(13)).toEqual([0, 4, 8, 12, 16]);
  });

  it('uses whole steps for small maxima', () => {
    expect(yAxisTicksForMax(2)).toEqual([0, 1, 2]);
    expect(yAxisTicksForMax(0)).toEqual([0, 1]);
  });
});

describe('pointLabelPlacements', () => {
  it('labels a value just under a labelled one below its point', () => {
    expect(pointLabelPlacements([3, 4], 8)).toEqual(['below', 'above']);
  });

  it('labels a repeated value once', () => {
    expect(pointLabelPlacements([1, 1, 0], 8)).toEqual(['above', null, null]);
  });

  it('keeps well-separated values above their points', () => {
    expect(pointLabelPlacements([2, 6], 8)).toEqual(['above', 'above']);
  });

  it('compares each value with the nearest labelled value above it', () => {
    expect(pointLabelPlacements([8, 7, 7, 6, 1], 8)).toEqual([
      'above',
      'below',
      null,
      null,
      'above',
    ]);
  });

  it('never stacks a label into the one placed below the value above it', () => {
    // Axis top 24 puts the near gap at 3.12: 22 sits close under 24, so it
    // labels below. 21 is close under 22, where that label already sits.
    expect(pointLabelPlacements([24, 22, 21], 24)).toEqual([
      'above',
      'below',
      null,
    ]);
    // 18 clears 22's point but not its label, so it labels below as well.
    expect(pointLabelPlacements([24, 22, 18], 24)).toEqual([
      'above',
      'below',
      'below',
    ]);
    // 15 clears both, so it labels above again.
    expect(pointLabelPlacements([24, 22, 15], 24)).toEqual([
      'above',
      'below',
      'above',
    ]);
  });
});
