import type { DbClient } from '@/lib/db/types';
import type { SQLWrapper } from 'drizzle-orm';

/**
 * Returns the rows of a raw `execute()` result. postgres.js (the app) resolves
 * to a row array; node-postgres (the jobs Worker) resolves to `{ rows }`.
 */
export function toExecuteRows<TRow>(result: unknown): TRow[] {
  if (Array.isArray(result)) {
    return result as TRow[];
  }

  if (typeof result === 'object' && result !== null) {
    const rows: unknown = Reflect.get(result, 'rows');
    if (Array.isArray(rows)) {
      return rows as TRow[];
    }
  }

  throw new TypeError('Unrecognized execute() result: expected rows.');
}

/** Runs a raw SQL query and returns its rows on either Postgres driver. */
export async function executeRows<TRow>(
  dbClient: Pick<DbClient, 'execute'>,
  query: SQLWrapper,
): Promise<TRow[]> {
  return toExecuteRows<TRow>(await dbClient.execute(query));
}
