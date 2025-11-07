import { db as serviceDb } from '@/lib/db/drizzle';
import { getRequestContext } from '@/lib/api/context';

/**
 * Returns the appropriate database client based on execution context:
 * - In request handlers: Returns the RLS-enforced DB from request context
 * - In workers/tests: Returns the service-role DB (bypasses RLS)
 *
 * This allows query modules to work in both contexts without explicit context passing.
 *
 * @returns Drizzle database client (RLS-enforced in requests, service-role elsewhere)
 */
export function getDb(): typeof serviceDb {
  const ctx = getRequestContext();
  // We assert the request-scoped DB conforms to the service DB shape.
  // Both Drizzle clients expose the same query API we use across the app.
  return (ctx?.db as typeof serviceDb | undefined) ?? serviceDb;
}
