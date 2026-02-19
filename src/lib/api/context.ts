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

type HeaderSource =
  | { headers?: Headers }
  | { get?: (key: string) => string | null };

function readHeader(source?: HeaderSource, key?: string) {
  if (!source) return undefined;
  const targetKey = key ?? 'x-correlation-id';
  if ('headers' in source && source.headers) {
    return source.headers.get(targetKey) ?? undefined;
  }
  if ('get' in source && typeof source.get === 'function') {
    const value = source.get(targetKey);
    return value ?? undefined;
  }
  return undefined;
}

export function ensureCorrelationId(source?: HeaderSource): string {
  const existing = readHeader(source);
  return existing && existing.length > 0 ? existing : randomUUID();
}

export interface CreateContextOptions {
  userId?: string;
  user?: RequestContext['user'];
  db?: DbClient;
  cleanup?: () => Promise<void>;
}

export function createRequestContext(
  req: Request,
  options?: CreateContextOptions
): RequestContext {
  const correlationId = ensureCorrelationId(req.headers);
  return {
    correlationId,
    userId: options?.userId,
    user: options?.user,
    db: options?.db,
    cleanup: options?.cleanup,
  };
}
