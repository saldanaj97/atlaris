import crypto from 'crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { resourceSearchCache } from '@/lib/db/schema';

/**
 * Cache stage types with different TTL requirements
 */
export type CacheStage = 'search' | 'yt-stats' | 'docs-head' | 'negative';

/**
 * Cache key structure for curation queries
 */
export type CurationCacheKey = {
  queryKey: string; // Normalized query string
  source: 'youtube' | 'doc'; // Source type
  paramsHash: string; // Hash of parameters
};

/**
 * Cached payload with results and metadata
 */
export type CachedPayload<T> = {
  results: T; // Cached results data
  scoredAt?: string; // ISO timestamp when scoring was computed
  expiresAt: string; // ISO timestamp when cache expires
  cacheVersion: string; // Cache version for invalidation
};

/**
 * In-memory LRU cache for same-run lookups
 */
class LRUCache<K extends string | { queryKey: string }, V> {
  private cache: Map<string, V>;
  private readonly capacity: number;

  constructor(capacity: number) {
    this.cache = new Map();
    this.capacity = capacity;
  }

  private toKeyString(key: K): string {
    return typeof key === 'string' ? key : key.queryKey;
  }

  get(key: K): V | undefined {
    const k = this.toKeyString(key);
    if (!this.cache.has(k)) {
      return undefined;
    }
    const value = this.cache.get(k)!;
    this.cache.delete(k);
    this.cache.set(k, value);
    return value;
  }

  set(key: K, value: V): void {
    const k = this.toKeyString(key);
    if (this.cache.has(k)) {
      this.cache.delete(k);
    }
    if (this.cache.size >= this.capacity) {
      const iter = this.cache.keys();
      const first = iter.next();
      if (!first.done) {
        this.cache.delete(first.value);
      }
    }
    this.cache.set(k, value);
  }

  has(key: K): boolean {
    const k = this.toKeyString(key);
    return this.cache.has(k);
  }

  delete(key: K): boolean {
    const k = this.toKeyString(key);
    return this.cache.delete(k);
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * Get LRU cache size from environment or use default
 */
function getLRUSize(): number {
  const envSize = process.env.CURATION_LRU_SIZE;
  if (envSize) {
    const parsed = parseInt(envSize, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 500; // Default size
}

/**
 * In-process LRU cache instance
 */
export const lruCache = new LRUCache<
  string | CurationCacheKey,
  CachedPayload<unknown>
>(getLRUSize());

/**
 * Get TTL in milliseconds for a specific cache stage
 */
function getStageTTL(stage: CacheStage): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const MS_PER_HOUR = 60 * 60 * 1000;

  switch (stage) {
    case 'search': {
      const days = process.env.CURATION_CACHE_TTL_SEARCH_DAYS;
      const parsed = days ? parseInt(days, 10) : NaN;
      return !isNaN(parsed) && parsed > 0
        ? parsed * MS_PER_DAY
        : 7 * MS_PER_DAY;
    }
    case 'yt-stats': {
      const days = process.env.CURATION_CACHE_TTL_YT_STATS_DAYS;
      const parsed = days ? parseInt(days, 10) : NaN;
      return !isNaN(parsed) && parsed > 0
        ? parsed * MS_PER_DAY
        : 2 * MS_PER_DAY;
    }
    case 'docs-head': {
      const days = process.env.CURATION_CACHE_TTL_DOCS_HEAD_DAYS;
      const parsed = days ? parseInt(days, 10) : NaN;
      return !isNaN(parsed) && parsed > 0
        ? parsed * MS_PER_DAY
        : 5 * MS_PER_DAY;
    }
    case 'negative': {
      const hours = process.env.CURATION_NEGATIVE_CACHE_TTL_HOURS;
      const parsed = hours ? parseInt(hours, 10) : NaN;
      return !isNaN(parsed) && parsed > 0
        ? parsed * MS_PER_HOUR
        : 4 * MS_PER_HOUR;
    }
  }
}

/**
 * Normalize a query string for consistent cache keys
 */
function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Create a stable hash from input string
 */
function hashString(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Build a cache key from curation query parameters
 */
export function buildCacheKey(input: {
  query: string;
  source: 'youtube' | 'doc';
  paramsVersion: string;
  cacheVersion: string;
}): CurationCacheKey {
  const normalized = normalizeQuery(input.query);
  const composite = `${normalized}|${input.source}|${input.paramsVersion}|${input.cacheVersion}`;
  const queryKey = hashString(composite);

  return {
    queryKey,
    source: input.source,
    paramsHash: input.paramsVersion,
  };
}

/**
 * Get cached results for a given cache key
 * Checks in-memory LRU first, then falls back to DB
 */
export async function getCachedResults<T>(
  key: CurationCacheKey
): Promise<CachedPayload<T> | null> {
  // Check in-memory cache first
  const lruResult = lruCache.get(key.queryKey);
  if (lruResult) {
    // Verify not expired
    const now = new Date();
    const expiresAt = new Date(lruResult.expiresAt);
    if (expiresAt > now) {
      return lruResult as CachedPayload<T>;
    }
    // Expired, remove from LRU
    lruCache.delete(key.queryKey);
  }

  // Check DB cache
  const rows = await db
    .select()
    .from(resourceSearchCache)
    .where(eq(resourceSearchCache.queryKey, key.queryKey))
    .limit(1);

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  const now = new Date();

  // Check if expired
  if (row.expiresAt <= now) {
    // Expired, delete from DB
    await db
      .delete(resourceSearchCache)
      .where(eq(resourceSearchCache.queryKey, key.queryKey));
    return null;
  }

  // Build payload from DB row
  const payload: CachedPayload<T> = {
    results: row.results as T,
    expiresAt: row.expiresAt.toISOString(),
    cacheVersion: row.params.cacheVersion as string,
    scoredAt: row.params.scoredAt as string | undefined,
  };

  // Store in LRU for subsequent lookups
  lruCache.set(key.queryKey, payload as CachedPayload<unknown>);

  return payload;
}

/**
 * Set cached results for a given cache key
 * Stores in both DB and in-memory LRU
 */
export async function setCachedResults<T>(
  key: CurationCacheKey,
  stage: CacheStage,
  payload: CachedPayload<T>
): Promise<void> {
  const ttlMs = getStageTTL(stage);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);

  // Build params object with stage and metadata
  const params: Record<string, unknown> = {
    stage,
    cacheVersion: payload.cacheVersion,
    paramsHash: key.paramsHash,
  };

  if (payload.scoredAt) {
    params.scoredAt = payload.scoredAt;
  }

  // Upsert into DB
  await db
    .insert(resourceSearchCache)
    .values({
      queryKey: key.queryKey,
      source: key.source,
      params,
      results: payload.results as unknown[],
      expiresAt,
    })
    .onConflictDoUpdate({
      target: resourceSearchCache.queryKey,
      set: {
        source: key.source,
        params,
        results: payload.results as unknown[],
        expiresAt,
      },
    });

  // Store in LRU
  const lruPayload: CachedPayload<unknown> = {
    ...payload,
    expiresAt: expiresAt.toISOString(),
  };
  lruCache.set(key.queryKey, lruPayload);
}

/**
 * Get or set cached results with advisory lock for concurrency deduplication
 * Ensures only one upstream fetch per query_key under contention
 */
export async function getOrSetWithLock<T>(
  key: CurationCacheKey,
  stage: CacheStage,
  fetcher: () => Promise<T>
): Promise<T> {
  // Try to get from cache first
  const cached = await getCachedResults<T>(key);
  if (cached) {
    return cached.results;
  }

  // Derive two 32-bit integers from SHA256 for pg advisory locks to reduce collisions
  // pg_advisory_lock(bigint) is equivalent to pg_advisory_lock(int, int) under the hood,
  // but using two explicit 32-bit parts minimizes collision risk across different keys.
  const hashHex = key.queryKey; // already sha256 hex
  const part1 = Number.parseInt(hashHex.substring(0, 8), 16) | 0;
  const part2 = Number.parseInt(hashHex.substring(8, 16), 16) | 0;

  try {
    // Try to acquire advisory lock (non-blocking)
    const lockResult = await db.execute(
      sql`SELECT pg_try_advisory_lock(${part1}, ${part2}) as locked`
    );
    const locked = (lockResult[0] as { locked: boolean }).locked;

    if (!locked) {
      // Another process is fetching; wait for it to complete
      // Retry checking cache until it's populated or timeout
      const maxRetries = 20; // ~2 seconds total wait time
      for (let i = 0; i < maxRetries; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const rechecked = await getCachedResults<T>(key);
        if (rechecked) {
          return rechecked.results;
        }
      }
      // If still not available after retries, fall through to fetch
      // This handles edge cases where the lock holder failed
    }

    // Double-check cache after acquiring lock
    const doubleCheck = await getCachedResults<T>(key);
    if (doubleCheck) {
      return doubleCheck.results;
    }

    // Fetch from upstream
    const results = await fetcher();

    // Store in cache
    const cacheVersion = process.env.CURATION_CACHE_VERSION || '1';
    await setCachedResults<T>(key, stage, {
      results,
      expiresAt: new Date(Date.now() + getStageTTL(stage)).toISOString(),
      cacheVersion,
    });

    return results;
  } finally {
    // Always release the lock
    try {
      await db.execute(sql`SELECT pg_advisory_unlock(${part1}, ${part2})`);
    } catch (error) {
      // Log but don't throw - unlock failure is not critical
      console.warn('Failed to release advisory lock:', error);
    }
  }
}

/**
 * Clean up expired cache entries
 * @param limit Maximum number of rows to delete (optional)
 * @returns Number of rows deleted
 */
export async function cleanupExpiredCache(limit?: number): Promise<number> {
  const nowISO = new Date().toISOString();

  if (limit) {
    const rows = await db.execute(
      sql`
        WITH expired AS (
          SELECT id
          FROM "resource_search_cache"
          WHERE "expires_at" < ${nowISO}
          ORDER BY "expires_at" ASC
          LIMIT ${limit}
        )
        DELETE FROM "resource_search_cache" AS r
        USING expired e
        WHERE r.id = e.id
        RETURNING r.id
      `
    );
    return rows.length;
  }

  const rows = await db.execute(
    sql`
      DELETE FROM "resource_search_cache"
      WHERE "expires_at" < ${nowISO}
      RETURNING id
    `
  );
  return rows.length;
}
