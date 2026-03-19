import { describe, it, expect, vi, beforeEach } from 'vitest';

import { findRecentDuplicatePlan } from '@/features/plans/lifecycle/plan-operations';

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Build a chainable mock DbClient that resolves with the given rows.
 * Mimics the Drizzle query builder chain: select → from → where → limit.
 *
 * Uses `as unknown as` double cast because Drizzle's internal query-builder
 * types are deeply nested generics that cannot be satisfied with a simple
 * partial mock. The cast is safe here since we only exercise the fluent
 * chain methods the function under test actually calls.
 */
function createMockDbClient(rows: Array<{ id: string }>) {
  const limitFn = vi.fn().mockResolvedValue(rows);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  const selectFn = vi.fn().mockReturnValue({ from: fromFn });

  return {
    client: { select: selectFn } as unknown as Parameters<
      typeof findRecentDuplicatePlan
    >[2],
    spies: { selectFn, fromFn, whereFn, limitFn },
  };
}

// ─── Tests ───────────────────────────────────────────────────────

describe('findRecentDuplicatePlan', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the plan ID when a matching row exists', async () => {
    const { client } = createMockDbClient([{ id: 'dup-plan-123' }]);

    const result = await findRecentDuplicatePlan(
      'user-abc',
      'Learn TypeScript',
      client
    );

    expect(result).toBe('dup-plan-123');
  });

  it('returns null when no matching row exists', async () => {
    const { client } = createMockDbClient([]);

    const result = await findRecentDuplicatePlan(
      'user-abc',
      'Learn TypeScript',
      client
    );

    expect(result).toBeNull();
  });

  it('queries with limit(1) to return at most one result', async () => {
    const { client, spies } = createMockDbClient([]);

    await findRecentDuplicatePlan('user-abc', 'Learn TypeScript', client);

    expect(spies.limitFn).toHaveBeenCalledWith(1);
  });

  it('returns id from first element when result array has multiple entries (defensive)', async () => {
    const { client } = createMockDbClient([
      { id: 'first-plan' },
      { id: 'second-plan' },
    ]);

    const result = await findRecentDuplicatePlan(
      'user-abc',
      'Learn TypeScript',
      client
    );

    expect(result).toBe('first-plan');
  });

  it('propagates database errors to the caller', async () => {
    const dbError = new Error('DB connection lost');
    const limitFn = vi.fn().mockRejectedValue(dbError);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    const selectFn = vi.fn().mockReturnValue({ from: fromFn });

    const client = { select: selectFn } as unknown as Parameters<
      typeof findRecentDuplicatePlan
    >[2];

    await expect(
      findRecentDuplicatePlan('user-abc', 'Learn TypeScript', client)
    ).rejects.toThrow('DB connection lost');
  });
});
