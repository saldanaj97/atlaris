import { derivePlanSummaryDisplayStatus } from '@/features/plans/read-projection/client';
import type { PlanReadStatus } from '@/features/plans/read-projection/types';
import type { PlanSummary } from '@/shared/types/db.types';
import { createId } from '@tests/fixtures/ids';
import { buildPlan, buildPlanSummary } from '@tests/fixtures/plan-detail';
import { describe, expect, it } from 'vitest';

type SummaryFixture = Omit<Partial<PlanSummary>, 'plan'> & {
  plan?: Partial<PlanSummary['plan']>;
};

function summary(partial: SummaryFixture = {}): PlanSummary {
  const planId = partial.plan?.id ?? createId('plan');
  const userId = partial.plan?.userId ?? createId('user');
  const { modules: _planModules, ...plan } = buildPlan({
    id: planId,
    userId,
    topic: 'T',
    skillLevel: 'beginner',
    weeklyHours: 1,
    learningStyle: 'reading',
    visibility: 'private',
    origin: 'ai',
    generationStatus: 'ready',
    isQuotaEligible: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-04-20T00:00:00.000Z'),
    ...partial.plan,
  });

  return buildPlanSummary({
    plan,
    modules: partial.modules ?? [],
    completion: partial.completion ?? 0,
    completedTasks: partial.completedTasks ?? 0,
    totalTasks: partial.totalTasks ?? 1,
    totalMinutes: partial.totalMinutes ?? 10,
    completedMinutes: partial.completedMinutes ?? 0,
    completedModules: partial.completedModules ?? 0,
    attemptsCount: partial.attemptsCount,
  });
}

describe('derivePlanSummaryDisplayStatus', () => {
  const ref = new Date('2026-04-22T12:00:00.000Z');

  it.each<{
    name: string;
    overrides: SummaryFixture;
    expected: PlanReadStatus;
  }>([
    {
      name: 'active when canonical active and recently updated',
      overrides: {},
      expected: 'active',
    },
    {
      name: 'generating when generation in flight (no modules)',
      overrides: {
        plan: { generationStatus: 'generating' },
        modules: [],
      },
      expected: 'generating',
    },
    {
      name: 'paused when canonical active but not updated 30+ days',
      overrides: {
        plan: { updatedAt: new Date('2026-03-01T00:00:00.000Z') },
      },
      expected: 'paused',
    },
    {
      name: 'active when <30d since update (boundary)',
      overrides: {
        plan: { updatedAt: new Date('2026-03-24T00:00:00.000Z') },
      },
      expected: 'active',
    },
    {
      name: 'completed when completion 100% despite stale dates',
      overrides: {
        completion: 1,
        plan: { updatedAt: new Date('2020-01-01T00:00:00.000Z') },
      },
      expected: 'completed',
    },
    {
      name: 'failed from canonical path surfaces without paused overlay',
      overrides: {
        plan: { generationStatus: 'failed' },
        modules: [],
      },
      expected: 'failed',
    },
  ])('$name', ({ overrides, expected }) => {
    expect(
      derivePlanSummaryDisplayStatus({
        summary: summary(overrides),
        referenceDate: ref,
      }),
    ).toBe(expected);
  });
});
