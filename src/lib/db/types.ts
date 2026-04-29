import type { drizzle } from 'drizzle-orm/postgres-js';
import type * as schema from '@/lib/db/schema';

export type DbClient = Awaited<ReturnType<typeof drizzle<typeof schema>>>;

/** Drizzle transaction callback argument type for `dbClient.transaction(...)`. */
export type DbTransaction = Parameters<
  Parameters<DbClient['transaction']>[0]
>[0];
