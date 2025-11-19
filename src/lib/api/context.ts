import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestContext {
  correlationId: string;
  userId?: string;
  // Loosely typed to allow either RLS (neon) or service-role (Postgres) Drizzle clients
  // Callers should use getDb() which returns a consistent, typed handle
  db?: unknown;
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

export function createRequestContext(
  req: Request,
  userId?: string,
  db?: unknown
): RequestContext {
  const correlationId = ensureCorrelationId(req.headers);
  return { correlationId, userId, db };
}
