import { getGenerationAttemptCap } from '@/features/ai/generation-policy';
import { derivePlanSummaryDisplayStatus } from '@/features/plans/read-projection/client';
import { deriveCanonicalPlanSummaryStatus } from '@/features/plans/read-projection/summary-status';
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
      name: 'failed when generation in flight exhausted attempts without modules',
      overrides: {
        plan: {
          generationStatus: 'generating',
          updatedAt: new Date('2026-03-01T00:00:00.000Z'),
        },
        modules: [],
        attemptsCount: getGenerationAttemptCap(),
      },
      expected: 'failed',
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

  it('omits attempt cap when attemptsCount is undefined (ready, no modules -> active -> paused if stale)', () => {
    const s = summary({
      modules: [],
      plan: { updatedAt: new Date('2026-03-01T00:00:00.000Z') },
      attemptsCount: undefined,
    });
    expect(s.attemptsCount).toBeUndefined();
    expect(
      derivePlanSummaryDisplayStatus({ summary: s, referenceDate: ref }),
    ).toBe('paused');
  });

  it('below attempt cap stays generating when stale (no paused overlay on non-active canonical)', () => {
    expect(
      derivePlanSummaryDisplayStatus({
        summary: summary({
          modules: [],
          plan: {
            generationStatus: 'ready',
            updatedAt: new Date('2026-03-01T00:00:00.000Z'),
          },
          attemptsCount: getGenerationAttemptCap() - 1,
        }),
        referenceDate: ref,
      }),
    ).toBe('generating');
  });

  it.each(['generating', 'pending_retry'] as const)(
    'no attemptsCount still generating when stale for %s without modules',
    (generationStatus) => {
      expect(
        derivePlanSummaryDisplayStatus({
          summary: summary({
            modules: [],
            plan: {
              generationStatus,
              updatedAt: new Date('2026-03-01T00:00:00.000Z'),
            },
            attemptsCount: undefined,
          }),
          referenceDate: ref,
        }),
      ).toBe('generating');
    },
  );

  it('active when invalid updatedAt Date but reference valid (staleness skipped)', () => {
    expect(
      derivePlanSummaryDisplayStatus({
        summary: summary({
          plan: { updatedAt: new Date(Number.NaN) },
        }),
        referenceDate: ref,
      }),
    ).toBe('active');
  });

  it('active when unparsable updatedAt string but reference valid (staleness skipped)', () => {
    expect(
      derivePlanSummaryDisplayStatus({
        summary: summary({
          plan: {
            updatedAt: 'not-a-date' as unknown as Date,
          },
        }),
        referenceDate: ref,
      }),
    ).toBe('active');
  });

  it('active when referenceDate is invalid (staleness skipped)', () => {
    expect(
      derivePlanSummaryDisplayStatus({
        summary: summary({
          plan: { updatedAt: new Date('2026-03-01T00:00:00.000Z') },
        }),
        referenceDate: 'not-a-date',
      }),
    ).toBe('active');
  });

  it('display matches canonical summary status whenever overlay would not change result', () => {
    const cases: SummaryFixture[] = [
      {
        plan: { generationStatus: 'generating' },
        modules: [],
      },
      {
        plan: { generationStatus: 'failed' },
        modules: [],
      },
      { completion: 1 },
      {
        modules: [],
        attemptsCount: getGenerationAttemptCap(),
        plan: { generationStatus: 'ready' },
      },
    ];

    for (const overrides of cases) {
      const s = summary(overrides);
      const canonical = deriveCanonicalPlanSummaryStatus({
        plan: s.plan,
        completion: s.completion,
        modules: s.modules.map((m) => ({ id: m.id })),
        attemptsCount: s.attemptsCount,
      });
      expect(
        derivePlanSummaryDisplayStatus({
          summary: s,
          referenceDate: ref,
        }),
      ).toBe(canonical);
    }
  });
});
