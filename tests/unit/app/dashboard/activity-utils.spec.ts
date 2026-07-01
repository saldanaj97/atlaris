import { findActivePlan } from '@/app/(app)/dashboard/components/activity-utils';
import {
  buildModuleRows,
  buildPlan,
  buildPlanSummary,
} from '@tests/fixtures/plan-detail';
import { describe, expect, it } from 'vitest';

function planSummary(overrides: {
  id: string;
  topic: string;
  completedTasks?: number;
  completion?: number;
  generationStatus?: 'ready' | 'generating';
  moduleCount?: number;
  updatedAt: string;
}) {
  const { modules: _modules, ...plan } = buildPlan({
    id: overrides.id,
    topic: overrides.topic,
    generationStatus: overrides.generationStatus ?? 'ready',
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
