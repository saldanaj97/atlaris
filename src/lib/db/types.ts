/**
 * Shared database client type used across RLS-enforced and service-role clients.
 * Both client types use the same Drizzle schema and expose the same query API,
 * so they are structurally compatible for the query modules we use.
 */
import type { drizzle } from 'drizzle-orm/postgres-js';
import type * as schema from './schema';

export type DbClient = Awaited<ReturnType<typeof drizzle<typeof schema>>>;
