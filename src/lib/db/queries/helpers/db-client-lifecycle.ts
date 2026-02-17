import { logger } from '@/lib/logging/logger';

export type CleanupCapableClient = {
  cleanup?: () => Promise<void>;
  destroy?: () => Promise<void>;
};

/**
 * Type guard: returns true if value is an object with a callable cleanup or destroy property.
 */
export function isDbClient(value: unknown): value is CleanupCapableClient {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return typeof obj.cleanup === 'function' || typeof obj.destroy === 'function';
}

/**
 * Tears down a typed database client.
 *
 * Supports both client APIs used in this codebase:
 * - RLS client wrappers exposing `cleanup()`
 * - direct clients exposing `destroy()`
 *
 * Private to this module — external callers must use `cleanupDbClient`.
 * Callers are responsible for deciding whether teardown is needed; this
 * function always tears down unconditionally.
 */
async function cleanupInternalDbClient(
  client: CleanupCapableClient
): Promise<void> {
  let cleanupFailed = false;

  if (typeof client.cleanup === 'function') {
    try {
      await client.cleanup();
    } catch (err) {
      cleanupFailed = true;
      logger.error(
        { err },
        'db-client-lifecycle: cleanup() failed; resources may be orphaned'
      );
    }
  }

  if (
    typeof client.destroy === 'function' &&
    (cleanupFailed || typeof client.cleanup !== 'function')
  ) {
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

/**
 * Public teardown entry point for internally-sourced database clients
 * (getDb(), createAuthenticatedRlsClient, or caller-injected dbClient).
 *
 * Callers decide whether to invoke this — do not call it when the client
 * was injected by an owner who manages its own lifecycle.
 *
 * Logs a warning and no-ops if the value does not look like a DB client
 * (i.e. lacks both `cleanup` and `destroy`).
 */
export async function cleanupDbClient(client: unknown): Promise<void> {
  if (!isDbClient(client)) {
    logger.warn(
      {
        clientType: typeof client,
        clientConstructor:
          (client as { constructor?: { name?: string } })?.constructor?.name ??
          'unknown',
      },
      'db-client-lifecycle: client lacked cleanup/destroy; no teardown performed — verify correct client type is being passed'
    );
    return;
  }

  await cleanupInternalDbClient(client);
}
