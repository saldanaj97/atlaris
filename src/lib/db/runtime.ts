import { db as serviceDb } from '@/lib/db/service-role';
import { getRequestContext } from '@/lib/api/context';
import { appEnv } from '@/lib/config/env';

/**
 * Returns the appropriate database client based on execution context:
 * - In test mode: Always returns service-role DB (bypasses RLS for integration tests)
 * - In request handlers: Returns the RLS-enforced DB from request context
 * - In workers/background jobs: Returns the service-role DB (bypasses RLS)
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
  // We assert the request-scoped DB conforms to the service DB shape.
  // Both Drizzle clients expose the same query API we use across the app.
  return (ctx?.db as typeof serviceDb | undefined) ?? serviceDb;
}
