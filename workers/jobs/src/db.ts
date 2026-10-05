import type { DbClient } from '@/lib/db/types';

import * as schema from '@supabase/schema';
import { runWithServiceRoleDb } from '@supabase/service-role';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

/** Six connections per invocation may wait on a response; keep one spare. */
const POOL_MAX = 5;

/**
 * Runs `fn` with a node-postgres pool over Hyperdrive that lives for this
 * invocation only (Workers forbid I/O reuse across requests). Inside `fn`,
 * the app's service-role `db` export resolves to the same client.
 */
export async function withInvocationDb<T>(
  hyperdrive: Pick<Hyperdrive, 'connectionString'>,
  ctx: Pick<ExecutionContext, 'waitUntil'>,
  fn: (db: DbClient) => Promise<T>,
): Promise<T> {
  const pool = new Pool({
    connectionString: hyperdrive.connectionString,
    max: POOL_MAX,
  });
  const db = drizzle(pool, { schema });

  try {
    return await runWithServiceRoleDb(db, () => fn(db));
  } finally {
    ctx.waitUntil(pool.end());
  }
}
