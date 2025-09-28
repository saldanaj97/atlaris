import { beforeEach, describe, expect, it } from 'vitest';

import { recordSuccess, startAttempt } from '@/lib/db/queries/attempts';
import {
  getAttemptMetricsSnapshot,
  resetAttemptMetrics,
} from '@/lib/metrics/attempts';

import {
  MockDbClient,
  asDbClient,
  createInput,
  createModules,
  createSequentialNow,
} from './helpers/attempts';

describe('attempt metrics – duration tracking', () => {
  beforeEach(() => {
    resetAttemptMetrics();
  });

  it('records positive duration for success attempts', async () => {
    const mockDb = new MockDbClient();
    mockDb.planOwnerUserId = 'user-metrics';

    const now = createSequentialNow([
      new Date('2024-01-01T00:00:00.000Z'),
      new Date('2024-01-01T00:00:02.000Z'),
    ]);

    const input = createInput();
    const preparation = await startAttempt({
      planId: 'plan-metrics',
      userId: 'user-metrics',
      input,
      dbClient: asDbClient(mockDb),
      now,
    });

    await recordSuccess({
      planId: 'plan-metrics',
      preparation,
      modules: createModules(),
      providerMetadata: undefined,
      durationMs: 0,
      extendedTimeout: false,
      dbClient: asDbClient(mockDb),
      now,
    });

    const snapshot = getAttemptMetricsSnapshot();

    expect(snapshot.success.count).toBe(1);
    expect(snapshot.success.duration.last).not.toBeNull();
    expect(snapshot.success.duration.last).toBeGreaterThan(0);
    expect(snapshot.success.modules.last).toBe(2);
    expect(snapshot.success.tasks.last).toBe(2);
  });
});
