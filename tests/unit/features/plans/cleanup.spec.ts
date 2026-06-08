import type { DbClient } from '@/lib/db/types';

import {
  cleanupOrphanedAttempts,
  cleanupStuckPlans,
  ORPHANED_ATTEMPT_THRESHOLD_MS,
  STUCK_PLAN_THRESHOLD_MS,
} from '@/features/plans/cleanup';
import { logger } from '@/lib/logging/logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the logger to avoid console noise and allow assertion
vi.mock('@/lib/logging/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

function createMockDbClient(resultCount: number) {
  const rows = Array.from({ length: resultCount }, (_, i) => ({
    id: `id-${i}`,
  }));
  const forFn = vi.fn().mockResolvedValue(rows);
  const limitFn = vi.fn().mockReturnValue({ for: forFn });
  const whereSelectFn = vi.fn().mockReturnValue({ limit: limitFn });
  const transactionFn = vi.fn();
  const fromFn = vi.fn().mockReturnValue({ where: whereSelectFn });
  const selectFn = vi.fn().mockReturnValue({ from: fromFn });
  const returningFn = vi.fn().mockResolvedValue(rows);
  const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
  const setFn = vi.fn().mockReturnValue({ where: whereFn });
  const updateFn = vi.fn().mockReturnValue({ set: setFn });

  // NOTE: keeps a bespoke chainable Drizzle stub instead of tests/fixtures/db-mocks.ts#makeDbClient because this test asserts transaction plus select().from().where().limit().for() behavior via the chain.
  const client = {
    select: selectFn,
    update: updateFn,
    transaction: transactionFn,
  } as unknown as DbClient;

  transactionFn.mockImplementation(
    async (callback: (tx: DbClient) => unknown) => callback(client),
  );

  return {
    client,
    spies: {
      selectFn,
      fromFn,
      whereSelectFn,
      limitFn,
      forFn,
      updateFn,
      setFn,
      whereFn,
      returningFn,
      transactionFn,
    },
  };
}

describe('cleanupStuckPlans', () => {
  let mockDb: ReturnType<typeof createMockDbClient>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks stuck generating plans as failed with one bulk update', async () => {
    mockDb = createMockDbClient(3);
    const markFailuresInTx = vi.fn().mockResolvedValue(3);
    markFailuresInTx.mockImplementation(
      (_tx, planIds: string[], timestamp: Date) => {
        expect(planIds).toEqual(['id-0', 'id-1', 'id-2']);
        expect(timestamp).toBeInstanceOf(Date);
        return Promise.resolve(planIds.length);
      },
    );

    const result = await cleanupStuckPlans(mockDb.client, undefined, {
      markFailuresInTx,
    });

    expect(result.cleaned).toBe(3);
    expect(mockDb.spies.transactionFn).toHaveBeenCalledTimes(1);
    expect(markFailuresInTx).toHaveBeenCalledTimes(1);
    expect(markFailuresInTx).toHaveBeenCalledWith(
      mockDb.client,
      ['id-0', 'id-1', 'id-2'],
      expect.any(Date),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'cleanup',
        event: 'stuck_plans_cleaned',
        count: 3,
      }),
      expect.stringContaining('3'),
    );

    const timestampArg = markFailuresInTx.mock.calls[0]?.[2] as Date;
    expect(timestampArg).toBeInstanceOf(Date);
  });

  it('returns 0 and skips bulk update when no stuck plans exist', async () => {
    mockDb = createMockDbClient(0);
    const markFailuresInTx = vi.fn();

    const result = await cleanupStuckPlans(mockDb.client, undefined, {
      markFailuresInTx,
    });

    expect(result.cleaned).toBe(0);
    expect(markFailuresInTx).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('has a reasonable stuck plan threshold', () => {
    const fiveMinutes = 5 * 60 * 1000;
    const sixtyMinutes = 60 * 60 * 1000;
    expect(STUCK_PLAN_THRESHOLD_MS).toBeGreaterThanOrEqual(fiveMinutes);
    expect(STUCK_PLAN_THRESHOLD_MS).toBeLessThanOrEqual(sixtyMinutes);
  });

  it('accepts a custom threshold', async () => {
    mockDb = createMockDbClient(1);
    const markFailuresInTx = vi.fn().mockResolvedValue(1);
    const customThreshold = 5 * 60 * 1000; // 5 minutes

    const result = await cleanupStuckPlans(mockDb.client, customThreshold, {
      markFailuresInTx,
    });

    expect(result.cleaned).toBe(1);
    expect(markFailuresInTx).toHaveBeenCalledWith(
      mockDb.client,
      ['id-0'],
      expect.any(Date),
    );
  });
});

describe('cleanupOrphanedAttempts', () => {
  let mockDb: ReturnType<typeof createMockDbClient>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('finalizes orphaned in_progress attempts and returns count', async () => {
    mockDb = createMockDbClient(5);

    const result = await cleanupOrphanedAttempts(mockDb.client);

    expect(result.cleaned).toBe(5);
    expect(mockDb.spies.updateFn).toHaveBeenCalledTimes(1);
    expect(mockDb.spies.setFn).toHaveBeenCalledWith(
      expect.objectContaining({
        classification: 'timeout',
      }),
    );
  });

  it('returns 0 when no orphaned attempts exist', async () => {
    mockDb = createMockDbClient(0);

    const result = await cleanupOrphanedAttempts(mockDb.client);

    expect(result.cleaned).toBe(0);
  });

  it('has a reasonable orphaned attempt threshold', () => {
    const fiveMinutes = 5 * 60 * 1000;
    const sixtyMinutes = 60 * 60 * 1000;
    expect(ORPHANED_ATTEMPT_THRESHOLD_MS).toBeGreaterThanOrEqual(fiveMinutes);
    expect(ORPHANED_ATTEMPT_THRESHOLD_MS).toBeLessThanOrEqual(sixtyMinutes);
  });

  it('accepts a custom threshold', async () => {
    mockDb = createMockDbClient(2);
    const customThreshold = 30 * 60 * 1000; // 30 minutes

    const result = await cleanupOrphanedAttempts(
      mockDb.client,
      customThreshold,
    );

    expect(result.cleaned).toBe(2);
  });
});
