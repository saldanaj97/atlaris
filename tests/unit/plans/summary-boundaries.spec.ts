import { describe, expect, it } from 'vitest';
import { findActivePlan } from '@/app/dashboard/components/activity-utils';
import { getPlanStatus } from '@/app/plans/components/plan-utils';
import { deriveCanonicalPlanSummaryStatus } from '@/features/plans/read-models/summary';
import { buildPlan, buildPlanSummary } from '../../fixtures/plan-detail';

describe('plan summary boundaries', () => {
  it('derives canonical summary status from generation status and completion', () => {
    const generating = buildPlanSummary({
      plan: buildPlan({ generationStatus: 'generating' }),
      modules: [],
      completion: 0,
    });
    const failed = buildPlanSummary({
      plan: buildPlan({ generationStatus: 'failed' }),
      modules: [],
      completion: 0.25,
    });
    const completed = buildPlanSummary({
      plan: buildPlan({ generationStatus: 'ready' }),
      completion: 1,
    });
    const active = buildPlanSummary({
      plan: buildPlan({ generationStatus: 'ready' }),
      completion: 0.4,
    });

    expect(deriveCanonicalPlanSummaryStatus(generating)).toBe('generating');
    expect(deriveCanonicalPlanSummaryStatus(failed)).toBe('failed');
    expect(deriveCanonicalPlanSummaryStatus(completed)).toBe('completed');
    expect(deriveCanonicalPlanSummaryStatus(active)).toBe('active');
  });

  it('adds paused status in the page adapter on top of canonical active', () => {
    const staleSummary = buildPlanSummary({
      plan: buildPlan({
        generationStatus: 'ready',
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      }),
      completion: 0.3,
    });

    expect(deriveCanonicalPlanSummaryStatus(staleSummary)).toBe('active');
    expect(
      getPlanStatus(staleSummary, new Date('2024-02-15T00:00:00.000Z'))
    ).toBe('paused');
  });

  it('treats retained modules as active even while generation is retrying', () => {
    const retryingWithModules = buildPlanSummary({
      plan: buildPlan({
        generationStatus: 'pending_retry',
        updatedAt: new Date('2024-02-10T00:00:00.000Z'),
      }),
      completion: 0.3,
    });

    expect(deriveCanonicalPlanSummaryStatus(retryingWithModules)).toBe(
      'active'
    );
  });

  it('keeps dashboard active-plan selection aligned with canonical active status', () => {
    const generating = buildPlanSummary({
      plan: buildPlan({
        id: 'plan-generating',
        generationStatus: 'generating',
        updatedAt: new Date('2024-02-03T00:00:00.000Z'),
      }),
      modules: [],
      completion: 0,
    });
    const completed = buildPlanSummary({
      plan: buildPlan({
        id: 'plan-completed',
        generationStatus: 'ready',
        updatedAt: new Date('2024-02-02T00:00:00.000Z'),
      }),
      completion: 1,
    });
    const activeOlder = buildPlanSummary({
      plan: buildPlan({
        id: 'plan-active-older',
        generationStatus: 'ready',
        updatedAt: new Date('2024-02-01T00:00:00.000Z'),
      }),
      completion: 0.2,
    });
    const activeNewer = buildPlanSummary({
      plan: buildPlan({
        id: 'plan-active-newer',
        generationStatus: 'ready',
        updatedAt: new Date('2024-02-04T00:00:00.000Z'),
      }),
      completion: 0.6,
    });

    expect(
      findActivePlan([generating, completed, activeOlder, activeNewer])?.plan.id
    ).toBe('plan-active-newer');
  });

  it('falls back to the most recent generating plan when no active plan exists', () => {
    const olderGenerating = buildPlanSummary({
      plan: buildPlan({
        id: 'plan-generating-older',
        generationStatus: 'generating',
        updatedAt: new Date('2024-02-03T00:00:00.000Z'),
      }),
      modules: [],
      completion: 0,
    });
    const newerGenerating = buildPlanSummary({
      plan: buildPlan({
        id: 'plan-generating-newer',
        generationStatus: 'pending_retry',
        updatedAt: new Date('2024-02-04T00:00:00.000Z'),
      }),
      modules: [],
      completion: 0,
    });
    const failed = buildPlanSummary({
      plan: buildPlan({
        id: 'plan-failed',
        generationStatus: 'failed',
        updatedAt: new Date('2024-02-05T00:00:00.000Z'),
      }),
      modules: [],
      completion: 0.25,
    });

    expect(
      findActivePlan([failed, olderGenerating, newerGenerating])?.plan.id
    ).toBe('plan-generating-newer');
  });
});
