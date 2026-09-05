import { countMetric, distributionMetric } from '@/lib/observability/metrics';
import * as Sentry from '@sentry/nextjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({
  metrics: {
    count: vi.fn(),
    distribution: vi.fn(),
  },
}));

describe('application metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('captures counters with attributes and units', () => {
    countMetric('atlaris.plan.created', 1, {
      attributes: { source: 'manual' },
      unit: 'event',
    });

    expect(Sentry.metrics.count).toHaveBeenCalledWith(
      'atlaris.plan.created',
      1,
      {
        attributes: { source: 'manual' },
        unit: 'event',
      },
    );
  });

  it('captures distributions', () => {
    distributionMetric('atlaris.plan.generate.duration', 532, {
      unit: 'millisecond',
    });

    expect(Sentry.metrics.distribution).toHaveBeenCalledWith(
      'atlaris.plan.generate.duration',
      532,
      {
        unit: 'millisecond',
      },
    );
  });

  it('does not capture metrics when Sentry is disabled', () => {
    vi.stubEnv('ENABLE_SENTRY', 'false');

    countMetric('atlaris.plan.created');

    expect(Sentry.metrics.count).not.toHaveBeenCalled();
  });

  it('drops invalid metric values before they reach Sentry', () => {
    countMetric('atlaris.plan.created', Number.NaN);
    distributionMetric(
      'atlaris.plan.generate.duration',
      Number.NEGATIVE_INFINITY,
    );

    expect(Sentry.metrics.count).not.toHaveBeenCalled();
    expect(Sentry.metrics.distribution).not.toHaveBeenCalled();
  });
});
