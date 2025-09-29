import { beforeEach, describe, expect, it } from 'vitest';

import {
  recordFailure,
  recordSuccess,
  startAttempt,
} from '@/lib/db/queries/attempts';
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

describe('attempt metrics – duration precision', () => {
  beforeEach(() => {
    resetAttemptMetrics();
  });

  it('keeps success attempt duration within measurable tolerance', async () => {
    const mockDb = new MockDbClient();
    mockDb.planOwnerUserId = 'user-duration-success';

    const now = createSequentialNow([
      new Date('2024-02-01T00:00:00.000Z'),
      new Date('2024-02-01T00:00:18.750Z'),
    ]);

    const preparation = await startAttempt({
      planId: 'plan-success',
      userId: 'user-duration-success',
      input: createInput(),
      dbClient: asDbClient(mockDb),
      now,
    });

    await recordSuccess({
      planId: 'plan-success',
      preparation,
      modules: createModules(),
      providerMetadata: undefined,
      durationMs: 18_650.7,
      extendedTimeout: true,
      dbClient: asDbClient(mockDb),
      now,
    });

    const attempt = mockDb.attempts.at(-1);
    expect(attempt).toBeDefined();

    const durationField = Number(attempt?.durationMs ?? 0);
    expect(durationField).toBeGreaterThan(0);
    expect(durationField).toBeLessThan(25_000);

    const metadataDuration = Number(
      (attempt?.metadata as { timing?: { duration_ms?: number } } | undefined)
        ?.timing?.duration_ms ?? 0
    );
    expect(metadataDuration).toBeGreaterThan(0);
    expect(metadataDuration).toBeLessThan(25_000);

    const snapshot = getAttemptMetricsSnapshot();
    const recorded = snapshot.success.duration.last;
    expect(recorded).not.toBeNull();
    expect(recorded ?? 0).toBeGreaterThan(0);
    expect(recorded ?? 0).toBeLessThan(25_000);
  });

  it('keeps failure attempt duration within measurable tolerance', async () => {
    const mockDb = new MockDbClient();
    mockDb.planOwnerUserId = 'user-duration-failure';

    const now = createSequentialNow([
      new Date('2024-03-01T08:00:00.000Z'),
      new Date('2024-03-01T08:00:09.900Z'),
    ]);

    const preparation = await startAttempt({
      planId: 'plan-failure',
      userId: 'user-duration-failure',
      input: createInput({ notes: 'Simulated timeout' }),
      dbClient: asDbClient(mockDb),
      now,
    });

    await recordFailure({
      planId: 'plan-failure',
      preparation,
      classification: 'timeout',
      durationMs: 9_950.25,
      timedOut: true,
      extendedTimeout: false,
      providerMetadata: undefined,
      dbClient: asDbClient(mockDb),
      now,
    });

    const attempt = mockDb.attempts.at(-1);
    expect(attempt).toBeDefined();

    const durationField = Number(attempt?.durationMs ?? 0);
    expect(durationField).toBeGreaterThan(0);
    expect(durationField).toBeLessThan(25_000);

    const metadataDuration = Number(
      (attempt?.metadata as { timing?: { duration_ms?: number } } | undefined)
        ?.timing?.duration_ms ?? 0
    );
    expect(metadataDuration).toBeGreaterThan(0);
    expect(metadataDuration).toBeLessThan(25_000);

    const snapshot = getAttemptMetricsSnapshot();
    const recorded = snapshot.failure.duration.last;
    expect(recorded).not.toBeNull();
    expect(recorded ?? 0).toBeGreaterThan(0);
    expect(recorded ?? 0).toBeLessThan(25_000);
  });
});
