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

/**
 * For Workflow steps: like `withInvocationDb`, but closes the pool before the
 * step returns instead of handing the close to `waitUntil`. An instance runs
 * several steps in one invocation, so no pool I/O may outlive its step.
 */
export async function withStepDb<T>(
  hyperdrive: Pick<Hyperdrive, 'connectionString'>,
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
    // A failed close must not fail (and so re-run) a step whose work is done.
    await pool.end().catch(() => undefined);
  }
}
