import { db as serviceDb } from './service-role';
import { getRequestContext } from '@/lib/api/context';
import { appEnv } from '@/lib/config/env';

export class MissingRequestDbContextError extends Error {
  constructor() {
    super(
      'Missing request-scoped database context. Request handlers must run inside withAuth/withRequestContext. Use service-role db explicitly in workers/background jobs.',
    );
    this.name = 'MissingRequestDbContextError';
  }
}

/**
 * Ambient request-establishment client only.
 *
 * Allowed callers:
 * - `src/lib/api/request-boundary.ts` (`RequestScope.db`)
 * - `src/lib/api/auth.ts` (`runWithTestContext`, `requireCurrentUserRecord`)
 *
 * Query and feature modules below that seam must take an explicit `dbClient`.
 * - In test mode: returns service-role DB (bypasses RLS for integration tests)
 * - In request handlers: returns the RLS-enforced DB from request context
 * - In non-test runtimes without request context: throws (fail-closed)
 *
 * @returns Drizzle database client (RLS-enforced in production requests, service-role elsewhere)
 */
export function getDb(): typeof serviceDb {
  // In test mode, always bypass RLS to allow integration tests to work
  // Integration tests create data via service-role DB and expect routes to see that data
  if (appEnv.isTest) {
    return serviceDb;
  }

  const ctx = getRequestContext();
  const requestDb: typeof serviceDb | undefined = ctx?.db;
  if (requestDb) {
    return requestDb;
  }

  throw new MissingRequestDbContextError();
}
