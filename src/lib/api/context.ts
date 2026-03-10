import type { DbClient } from '@/lib/db/types';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestContext {
  correlationId: string;
  userId?: string;
  /** Authenticated internal user for this request (set by withAuth). */
  user?: {
    id: string;
    authUserId: string;
  };
  /** RLS-enforced or service-role Drizzle client. Use getDb() from @/lib/db/runtime in handlers. */
  db?: DbClient;
  /** Cleanup function for RLS database connections. Call when request completes. */
  cleanup?: () => Promise<void>;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function withRequestContext<T>(
  context: RequestContext,
  run: () => T
): T {
  return storage.run(context, run);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore() ?? undefined;
}

export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

export type HeaderSource =
  | { headers?: Headers }
  | { get?: (key: string) => string | null };

/**
 * Reads a single header value from a Request-like object.
 * Exported so other modules (e.g. logging/request-context) can reuse it.
 */
export function readHeader(
  source: HeaderSource | undefined,
  key: string
): string | undefined {
  if (!source) return undefined;
  if ('headers' in source && source.headers) {
    return source.headers.get(key) ?? undefined;
  }
  if ('get' in source && typeof source.get === 'function') {
    const value = source.get(key);
    return value ?? undefined;
  }
  return undefined;
}

/**
 * Returns an existing request identifier from the given header, or generates a
 * new UUID. The default header is `x-correlation-id`; callers can override.
 */
export function ensureCorrelationId(
  source?: HeaderSource,
  headerName = 'x-correlation-id'
): string {
  const existing = readHeader(source, headerName);
  return existing && existing.length > 0 ? existing : randomUUID();
}

export interface CreateContextOptions {
  userId?: string;
  user?: RequestContext['user'];
  db?: DbClient;
  cleanup?: () => Promise<void>;
}

export function createRequestContext(
  req: Request | undefined,
  options?: CreateContextOptions
): RequestContext {
  const correlationId = ensureCorrelationId(req?.headers);
  return {
    correlationId,
    userId: options?.userId,
    user: options?.user,
    db: options?.db,
    cleanup: options?.cleanup,
  };
}
