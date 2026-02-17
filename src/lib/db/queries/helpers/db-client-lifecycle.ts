import { logger } from '@/lib/logging/logger';

export type CleanupCapableClient = {
  cleanup?: () => Promise<void>;
  destroy?: () => Promise<void>;
};

/**
 * Type guard: returns true if value is an object with a callable cleanup or destroy property.
 */
export function hasCleanup(value: unknown): value is CleanupCapableClient {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const obj = value as Record<string, unknown>;
  const hasCleanupFn = typeof obj.cleanup === 'function';
  const hasDestroyFn = typeof obj.destroy === 'function';
  return hasCleanupFn || hasDestroyFn;
}

/**
 * Conditionally cleanup a database client when this scope created it.
 *
 * Supports both client APIs used in this codebase:
 * - RLS client wrappers exposing `cleanup()`
 * - direct clients exposing `destroy()`
 *
 * Zod validation is intentionally omitted: the client is always from internal
 * sources (getDb(), createAuthenticatedRlsClient, or caller-injected dbClient).
 * No external boundary exists. The typeof checks before invocation ensure we
 * only call actual functions; missing or non-function properties are skipped.
 */
export async function cleanupInternalDbClient(
  client: unknown,
  shouldCleanup: boolean
): Promise<void> {
  if (!shouldCleanup) {
    return;
  }

  if (!hasCleanup(client)) {
    logger.debug(
      'db-client-lifecycle: client lacked cleanup/destroy; no teardown performed'
    );
    return;
  }

  if (typeof client.cleanup === 'function') {
    try {
      await client.cleanup();
    } catch (err) {
      logger.error(
        { err },
        'db-client-lifecycle: cleanup() failed; resources may be orphaned'
      );
    }
    return;
  }

  if (typeof client.destroy === 'function') {
    try {
      await client.destroy();
    } catch (err) {
      logger.error(
        { err },
        'db-client-lifecycle: destroy() failed; resources may be orphaned'
      );
    }
  }
}
