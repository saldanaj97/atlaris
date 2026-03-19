import { describe, it, expect, vi, beforeEach } from 'vitest';

import { findRecentDuplicatePlan } from '@/features/plans/lifecycle/plan-operations';

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Build a chainable mock DbClient that resolves with the given rows.
 * Mimics the Drizzle query builder chain: select → from → where → limit.
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

  it('returns the first match when multiple rows exist', async () => {
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
});
