import {
  findActivePlan,
  generateActivities,
  getDashboardGreeting,
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
  generationStatus?: 'ready' | 'generating';
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

describe('generateActivities', () => {
  it('emits labeled dashboard events with machine-readable timestamps', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-22T12:00:00.000Z'));

    const generated = planSummary({
      id: 'plan-generated',
      topic: 'Generated plan',
      createdAt: '2026-06-22T10:00:00.000Z',
      updatedAt: '2026-06-22T10:00:00.000Z',
    });
    const progressing = planSummary({
      id: 'plan-progress',
      topic: 'Progressing plan',
      completedTasks: 1,
      completion: 0.5,
      createdAt: '2026-06-20T10:00:00.000Z',
      updatedAt: '2026-06-22T11:00:00.000Z',
    });
    const completed = planSummary({
      id: 'plan-completed',
      topic: 'Completed plan',
      completedTasks: 2,
      completion: 1,
      createdAt: '2026-06-19T10:00:00.000Z',
      updatedAt: '2026-06-22T09:00:00.000Z',
    });

    const activities = generateActivities([generated, progressing, completed]);

    expect(activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'generated',
          title: 'Generated plan',
          occurredAt: '2026-06-22T10:00:00.000Z',
        }),
        expect.objectContaining({
          kind: 'progress',
          title: 'Progressing plan',
          occurredAt: '2026-06-22T11:00:00.000Z',
        }),
        expect.objectContaining({
          kind: 'completed',
          title: 'Completed plan',
          occurredAt: '2026-06-22T09:00:00.000Z',
        }),
      ]),
    );
  });
});

describe('findActivePlan', () => {
  it('keeps not-started plans eligible for the dashboard resume slot', () => {
    const notStarted = planSummary({
      id: 'plan-not-started',
      topic: 'Not started',
      updatedAt: '2026-06-21T00:00:00.000Z',
    });
    const generating = planSummary({
      id: 'plan-generating',
      topic: 'Generating',
      generationStatus: 'generating',
      moduleCount: 0,
      updatedAt: '2026-06-22T00:00:00.000Z',
    });

    expect(findActivePlan([generating, notStarted])).toBe(notStarted);
  });
});

describe('getDashboardGreeting', () => {
  it('grounds the greeting in the user and active plan progress', () => {
    const activePlan = planSummary({
      id: 'plan-active',
      topic: 'Workflow SDK TypeScript',
      completedTasks: 1,
      completion: 0.5,
      updatedAt: '2026-06-22T00:00:00.000Z',
    });

    expect(getDashboardGreeting('Juan Saldana', activePlan)).toBe(
      'Welcome back, Juan. You’re 50% through Workflow SDK TypeScript. Keep the momentum going.',
    );
    expect(getDashboardGreeting('Juan Saldana')).toBe(
      'Welcome back, Juan. Ready for your next challenge?',
    );
  });
});
