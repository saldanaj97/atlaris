import { vi } from 'vitest';
import type { AttemptsDbClient } from '@/lib/db/queries/types/attempts.types';
import type { DbClient } from '@/lib/db/types';

/**
 * Build a typed `DbClient` stub for tests that don't need the real database.
 *
 * Each top-level method is a `vi.fn()` that throws by default so unexpected
 * calls fail loudly. Override the methods the test exercises by spreading
 * `overrides` — anything not provided keeps the throwing default.
 *
 * This replaces the project's most common pattern of
 * `something as unknown as DbClient`, which silently masked shape drift.
 */
export function makeDbClient(overrides: Partial<DbClient> = {}): DbClient {
  const fallback = (method: string) =>
    vi.fn().mockImplementation(() => {
      throw new Error(
        `makeDbClient: ${method}() called but no implementation was provided. Pass it in the overrides argument.`,
      );
    });

  return {
    select: overrides.select ?? fallback('select'),
    insert: overrides.insert ?? fallback('insert'),
    update: overrides.update ?? fallback('update'),
    delete: overrides.delete ?? fallback('delete'),
    transaction: overrides.transaction ?? fallback('transaction'),
    execute: overrides.execute ?? fallback('execute'),
    query: overrides.query ?? fallback('query'),
  } as DbClient;
}

/**
 * `AttemptsDbClient` is currently a re-export of `DbClient` (see
 * src/lib/db/queries/types/attempts.types.ts). Helper provided so tests can
 * make their intent explicit at the call site.
 */
export function makeAttemptsDbClient(
  overrides: Partial<AttemptsDbClient> = {},
): AttemptsDbClient {
  return makeDbClient(overrides);
}
