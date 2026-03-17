import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import type { DbClient } from '@/lib/db/types';

export type RequestContext = {
  correlationId: string;
  userId?: string;
  user?: {
    id: string;
    authUserId: string;
  };
  db?: DbClient;
  cleanup?: () => Promise<void>;
};

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

type HeaderSource =
  | { headers?: Headers }
  | { get?: (key: string) => string | null };

/**
 * Reads a single header value from a Request-like or Headers-like source.
 *
 * Normalizes different {@link HeaderSource} shapes: prefers the `.headers`
 * Map-like accessor (e.g. `Request.headers.get(key)`) over a bare `.get`
 * function when both exist. Returns `undefined` when `source` is falsy,
 * when the header is not present, or when the value is `null`.
 *
 * @param source - A Request-like object with `.headers`, or a bare object
 *   with a `.get(key)` method, or `undefined`.
 * @param key - Case-insensitive header name (lowered by the underlying
 *   Headers implementation).
 * @returns The header value as a string, or `undefined` if missing/falsy.
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

type CreateContextOptions = {
  userId?: string;
  user?: RequestContext['user'];
  db?: DbClient;
  cleanup?: () => Promise<void>;
};

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
