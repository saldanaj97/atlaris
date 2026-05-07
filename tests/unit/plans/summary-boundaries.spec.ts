import { describe, expect, it } from 'vitest';
import { getGenerationAttemptCap } from '@/features/ai/generation-policy';
import {
  derivePlanReadStatus,
  derivePlanSummaryStatus,
} from '@/features/plans/read-projection/read-status';
import { deriveCanonicalPlanSummaryStatus } from '@/features/plans/read-projection/summary-status';
import type { Module } from '@/shared/types/db.types';

describe('plan summary status boundaries', () => {
  it('maps pending and processing read states to generating summary state', () => {
    expect(
      derivePlanSummaryStatus({ readStatus: 'pending', completion: 0 }),
    ).toBe('generating');
    expect(
      derivePlanSummaryStatus({ readStatus: 'processing', completion: 0.4 }),
    ).toBe('generating');
  });

  it('maps ready read state to active or completed based on completion', () => {
    expect(
      derivePlanSummaryStatus({ readStatus: 'ready', completion: 0 }),
    ).toBe('active');
    expect(
      derivePlanSummaryStatus({ readStatus: 'ready', completion: 0.2 }),
    ).toBe('active');
    expect(
      derivePlanSummaryStatus({ readStatus: 'ready', completion: 1 }),
    ).toBe('completed');
  });

  it('treats ready without modules below attempt cap as generating in summary views', () => {
    expect(
      deriveCanonicalPlanSummaryStatus({
        plan: { generationStatus: 'ready' },
        completion: 0,
        modules: [],
        attemptsCount: getGenerationAttemptCap() - 1,
      }),
    ).toBe('generating');
  });

  it('treats ready without modules at attempt cap as failed in summary views', () => {
    expect(
      deriveCanonicalPlanSummaryStatus({
        plan: { generationStatus: 'ready' },
        completion: 0,
        modules: [],
        attemptsCount: getGenerationAttemptCap(),
      }),
    ).toBe('failed');
  });

  it('treats ready without modules above attempt cap as failed in summary views', () => {
    expect(
      deriveCanonicalPlanSummaryStatus({
        plan: { generationStatus: 'ready' },
        completion: 0,
        modules: [],
        attemptsCount: getGenerationAttemptCap() + 1,
      }),
    ).toBe('failed');
  });

  it.each(['generating', 'pending_retry'] as const)(
    'treats %s without modules below attempt cap as generating in summary views',
    (generationStatus) => {
      expect(
        deriveCanonicalPlanSummaryStatus({
          plan: { generationStatus },
          completion: 0,
          modules: [],
          attemptsCount: getGenerationAttemptCap() - 1,
        }),
      ).toBe('generating');
    },
  );

  it.each(['generating', 'pending_retry'] as const)(
    'treats %s without modules at attempt cap as failed in summary views',
    (generationStatus) => {
      expect(
        deriveCanonicalPlanSummaryStatus({
          plan: { generationStatus },
          completion: 0,
          modules: [],
          attemptsCount: getGenerationAttemptCap(),
        }),
      ).toBe('failed');
    },
  );

  it('derivePlanReadStatus treats modules as ground truth over failed generationStatus', () => {
    const attemptCap = getGenerationAttemptCap();

    expect(
      derivePlanReadStatus({
        generationStatus: 'failed',
        hasModules: true,
        attemptsCount: attemptCap,
        attemptCap,
      }),
    ).toBe('ready');
  });

  it('deriveCanonicalPlanSummaryStatus yields active when modules exist despite failed generationStatus', () => {
    const attemptCap = getGenerationAttemptCap();
    const moduleRef = { id: 'module-1' } satisfies Pick<Module, 'id'>;

    expect(
      deriveCanonicalPlanSummaryStatus({
        plan: { generationStatus: 'failed' },
        completion: 0.25,
        modules: [moduleRef],
        attemptsCount: attemptCap,
      }),
    ).toBe('active');
  });
});
