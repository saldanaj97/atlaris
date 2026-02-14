import { getRequestContext } from '@/lib/api/context';
import { appEnv } from '@/lib/config/env';
import { db as serviceDb } from '@/lib/db/service-role';

export class MissingRequestDbContextError extends Error {
  constructor() {
    super(
      'Missing request-scoped database context. Request handlers must run inside withAuth/withRequestContext. Use service-role db explicitly in workers/background jobs.'
    );
    this.name = 'MissingRequestDbContextError';
  }
}

/**
 * Explicit service-role accessor for workers/background jobs.
 * Avoid using this in request handlers.
 */
export function getServiceDbForWorker(): typeof serviceDb {
  return serviceDb;
}

/**
 * Returns the appropriate database client based on execution context:
 * - In test mode: Always returns service-role DB (bypasses RLS for integration tests)
 * - In request handlers: Returns the RLS-enforced DB from request context
 * - In non-test runtimes without request context: throws (fail-closed)
 *
 * This allows query modules to work in all contexts without explicit context passing.
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
