import type * as schema from '@supabase/schema';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

/**
 * Driver-neutral Drizzle client: the app uses postgres.js, the jobs Worker
 * uses node-postgres. Read `execute()` results through `executeRows`.
 */
export type DbClient = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Drizzle transaction callback argument type for `dbClient.transaction(...)`. */
export type DbTransaction = Parameters<
  Parameters<DbClient['transaction']>[0]
>[0];
