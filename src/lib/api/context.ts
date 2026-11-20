import type { ActorUser } from '@/lib/db/queries/types/users.types';
import type { DbClient } from '@/lib/db/types';

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

type RequestContext = {
  correlationId: string;
  userId?: string;
  user?: ActorUser;
  db?: DbClient;
  cleanup?: () => Promise<void>;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function withRequestContext<T>(
  context: RequestContext,
  run: () => T,
): T {
  return storage.run(context, run);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

type HeaderSource =
  | { headers?: Headers }
  | { get?: (key: string) => string | null };

function readHeader(
  source: HeaderSource | undefined,
  key: string,
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
  headerName = 'x-correlation-id',
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
  options?: CreateContextOptions,
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
