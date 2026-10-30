import type { RecentLearningActivityRow } from '@/lib/db/queries/types/tasks.types';
import type { GenerationStatus } from '@/shared/types/db.types';

import {
  generateActivities,
  getDashboardHeroDescription,
  getDashboardHeroTitle,
} from '@/app/(app)/dashboard/components/activity-utils';
import {
  buildModuleRows,
  buildPlan,
  buildPlanSummary,
} from '@tests/fixtures/plan-detail';
import { afterEach, describe, expect, it, vi } from 'vitest';

function planSummary(overrides: {
  id: string;
  topic: string;
  completedTasks?: number;
  completion?: number;
  createdAt?: string;
  generationStatus?: GenerationStatus;
  moduleCount?: number;
  updatedAt: string;
}) {
  const { modules: _modules, ...plan } = buildPlan({
    id: overrides.id,
    topic: overrides.topic,
    generationStatus: overrides.generationStatus ?? 'ready',
    createdAt: new Date(overrides.createdAt ?? overrides.updatedAt),
    updatedAt: new Date(overrides.updatedAt),
  });

  const completedTasks = overrides.completedTasks ?? 0;
  const totalTasks = 2;

  return buildPlanSummary({
    plan,
    modules: buildModuleRows(plan.id, overrides.moduleCount ?? 1),
    completedTasks,
    totalTasks,
    completion: overrides.completion ?? completedTasks / totalTasks,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

function activityEvent(
  overrides: Partial<RecentLearningActivityRow> &
    Pick<RecentLearningActivityRow, 'id' | 'status' | 'occurredAt'>,
): RecentLearningActivityRow {
  return {
    planId: 'plan-events',
    planTopic: 'Event plan',
    taskTitle: 'Read the docs',
    taskEstimatedMinutes: 45,
    ...overrides,
  };
}

describe('generateActivities', () => {
  it('builds the feed from recorded task events and recent plans, newest first', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-22T12:00:00.000Z'));

    const created = planSummary({
      id: 'plan-created',
      topic: 'Created plan',
      createdAt: '2026-06-22T10:00:00.000Z',
      updatedAt: '2026-06-22T10:00:00.000Z',
    });
    const events = [
      activityEvent({
        id: 'evt-completed',
        status: 'completed',
        occurredAt: new Date('2026-06-22T11:00:00.000Z'),
      }),
      activityEvent({
        id: 'evt-started',
        status: 'in_progress',
        taskTitle: 'Write a component',
        occurredAt: new Date('2026-06-22T09:00:00.000Z'),
      }),
    ];

    expect(generateActivities([created], events)).toEqual([
      expect.objectContaining({
        id: 'event-evt-completed',
        kind: 'task-completed',
        planId: 'plan-events',
        title: 'Read the docs',
        planTopic: 'Event plan',
        minutes: 45,
        occurredAt: '2026-06-22T11:00:00.000Z',
      }),
      expect.objectContaining({
        id: 'plan-plan-created',
        kind: 'plan-created',
        title: 'Created plan',
        occurredAt: '2026-06-22T10:00:00.000Z',
      }),
      expect.objectContaining({
        id: 'event-evt-started',
        kind: 'task-started',
        title: 'Write a component',
        minutes: undefined,
        occurredAt: '2026-06-22T09:00:00.000Z',
      }),
    ]);
  });

  it('does not infer activity from plan completion or update time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-22T12:00:00.000Z'));

    const partlyDone = planSummary({
      id: 'plan-progress',
      topic: 'Progressing plan',
      completedTasks: 1,
      completion: 0.5,
      createdAt: '2026-06-01T10:00:00.000Z',
      updatedAt: '2026-06-22T11:00:00.000Z',
    });
    const allDone = planSummary({
      id: 'plan-completed',
      topic: 'Completed plan',
      completedTasks: 2,
      completion: 1,
      createdAt: '2026-06-01T10:00:00.000Z',
      updatedAt: '2026-06-22T09:00:00.000Z',
    });

    expect(generateActivities([partlyDone, allDone], [])).toEqual([]);
  });

  it.each(['generating', 'pending_retry', 'failed'] as const)(
    'does not list a %s plan as created',
    (generationStatus) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-22T12:00:00.000Z'));

      const plan = planSummary({
        id: `plan-${generationStatus}`,
        topic: `${generationStatus} plan`,
        createdAt: '2026-06-22T10:00:00.000Z',
        generationStatus,
        updatedAt: '2026-06-22T10:00:00.000Z',
      });

      expect(generateActivities([plan], [])).toEqual([]);
    },
  );
});

describe('getDashboardHeroDescription', () => {
  it('does not describe a generating plan as ready', () => {
    const generatingPlan = planSummary({
      id: 'plan-generating',
      topic: 'Distributed systems',
      generationStatus: 'generating',
      moduleCount: 0,
      updatedAt: '2026-06-22T00:00:00.000Z',
    });

    expect(getDashboardHeroDescription(generatingPlan)).toBe(
      'Your plan for Distributed systems is still being created.',
    );
  });

  it('grounds the description in active plan progress', () => {
    const activePlan = planSummary({
      id: 'plan-active',
      topic: 'Workflow SDK TypeScript',
      completedTasks: 1,
      completion: 0.5,
      updatedAt: '2026-06-22T00:00:00.000Z',
    });

    expect(getDashboardHeroDescription(activePlan)).toBe(
      'You’re 50% through Workflow SDK TypeScript. Keep the momentum going.',
    );
    expect(getDashboardHeroDescription()).toBe(
      'Ready for your next challenge?',
    );
  });
});

describe('getDashboardHeroTitle', () => {
  it('uses the first name and falls back without one', () => {
    expect(getDashboardHeroTitle('Juan Saldana')).toBe('Welcome back, Juan.');
    expect(getDashboardHeroTitle('  ')).toBe('Welcome back.');
    expect(getDashboardHeroTitle(undefined)).toBe('Welcome back.');
  });
});
