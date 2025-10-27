/**
 * Unit tests for cache module
 * Tests: LRU capacity/eviction, TTL resolution, negative cache, get/set, dedupe, cleanup
 */

/**
 * Unit tests for cache module
 * Tests: LRU capacity/eviction, TTL resolution, negative cache, get/set, dedupe, cleanup
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/drizzle';
import { resourceSearchCache } from '@/lib/db/schema';
import {
  buildCacheKey,
  cleanupExpiredCache,
  getCachedResults,
  getOrSetWithLock,
  setCachedResults,
  type CachedPayload,
  type CacheStage,
} from '@/lib/curation/cache';
import { eq } from 'drizzle-orm';

describe('Cache Module', () => {
  beforeEach(async () => {
    // Clean up any existing cache entries
    await db.delete(resourceSearchCache);
  });

  afterEach(async () => {
    // Clean up after each test
    await db.delete(resourceSearchCache);
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe('buildCacheKey', () => {
    it('should generate consistent hash for same inputs', () => {
      const key1 = buildCacheKey({
        query: 'React Hooks',
        source: 'youtube',
        paramsVersion: 'v1',
        cacheVersion: '1',
      });

      const key2 = buildCacheKey({
        query: 'React Hooks',
        source: 'youtube',
        paramsVersion: 'v1',
        cacheVersion: '1',
      });

      expect(key1.queryKey).toBe(key2.queryKey);
      expect(key1.source).toBe('youtube');
    });

    it('should normalize query strings', () => {
      const key1 = buildCacheKey({
        query: '  React   Hooks  ',
        source: 'youtube',
        paramsVersion: 'v1',
        cacheVersion: '1',
      });

      const key2 = buildCacheKey({
        query: 'react hooks',
        source: 'youtube',
        paramsVersion: 'v1',
        cacheVersion: '1',
      });

      expect(key1.queryKey).toBe(key2.queryKey);
    });

    it('should generate different hashes for different cache versions', () => {
      const key1 = buildCacheKey({
        query: 'React Hooks',
        source: 'youtube',
        paramsVersion: 'v1',
        cacheVersion: '1',
      });

      const key2 = buildCacheKey({
        query: 'React Hooks',
        source: 'youtube',
        paramsVersion: 'v1',
        cacheVersion: '2',
      });

      expect(key1.queryKey).not.toBe(key2.queryKey);
    });

    it('should generate different hashes for different sources', () => {
      const key1 = buildCacheKey({
        query: 'React Hooks',
        source: 'youtube',
        paramsVersion: 'v1',
        cacheVersion: '1',
      });

      const key2 = buildCacheKey({
        query: 'React Hooks',
        source: 'doc',
        paramsVersion: 'v1',
        cacheVersion: '1',
      });

      expect(key1.queryKey).not.toBe(key2.queryKey);
    });
  });

  describe('setCachedResults and getCachedResults', () => {
    it('should store and retrieve cached results', async () => {
      const key = buildCacheKey({
        query: 'TypeScript Tutorial',
        source: 'youtube',
        paramsVersion: 'v1',
        cacheVersion: '1',
      });

      const payload: CachedPayload<string[]> = {
        results: ['result1', 'result2'],
        cacheVersion: '1',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      };

      await setCachedResults(key, 'search', payload);

      const retrieved = await getCachedResults<string[]>(key);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.results).toEqual(['result1', 'result2']);
      expect(retrieved!.cacheVersion).toBe('1');
    });

    it('should return null for non-existent cache key', async () => {
      const key = buildCacheKey({
        query: 'Nonexistent',
        source: 'youtube',
        paramsVersion: 'v1',
        cacheVersion: '1',
      });

      const retrieved = await getCachedResults(key);
      expect(retrieved).toBeNull();
    });

    it('should return null and delete expired cache entries', async () => {
      const key = buildCacheKey({
        query: 'Expired Content',
        source: 'youtube',
        paramsVersion: 'v1',
        cacheVersion: '1',
      });

      const payload: CachedPayload<string[]> = {
        results: ['old-result'],
        cacheVersion: '1',
        expiresAt: new Date(Date.now() - 1000).toISOString(), // Already expired
      };

      // Manually insert expired entry
      await db.insert(resourceSearchCache).values({
        queryKey: key.queryKey,
        source: key.source,
        params: { stage: 'search', cacheVersion: '1' },
        results: payload.results,
        expiresAt: new Date(payload.expiresAt),
      });

      // Should return null and delete
      const retrieved = await getCachedResults(key);
      expect(retrieved).toBeNull();

      // Verify deleted from DB
      const rows = await db.select().from(resourceSearchCache);
      expect(rows.length).toBe(0);
    });

    it('should respect stage-specific TTLs', async () => {
      const key = buildCacheKey({
        query: 'TTL Test',
        source: 'youtube',
        paramsVersion: 'v1',
        cacheVersion: '1',
      });

      const stages: CacheStage[] = [
        'search',
        'yt-stats',
        'docs-head',
        'negative',
      ];

      for (const stage of stages) {
        const payload: CachedPayload<string[]> = {
          results: [`${stage}-result`],
          cacheVersion: '1',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        };

        await setCachedResults(key, stage, payload);

        const rows = await db
          .select()
          .from(resourceSearchCache)
          .where(eq(resourceSearchCache.queryKey, key.queryKey));

        expect(rows.length).toBe(1);
        expect(rows[0].params.stage).toBe(stage);

        // Clean up
        await db.delete(resourceSearchCache);
      }
    });
  });

  describe('getOrSetWithLock', () => {
    it('should fetch and cache when not cached', async () => {
      const key = buildCacheKey({
        query: 'Fresh Content',
        source: 'youtube',
        paramsVersion: 'v1',
        cacheVersion: '1',
      });

      const fetcher = vi.fn(async () => ['fetched-result']);

      const result = await getOrSetWithLock(key, 'search', fetcher);

      expect(fetcher).toHaveBeenCalledOnce();
      expect(result).toEqual(['fetched-result']);

      // Verify cached
      const cached = await getCachedResults<string[]>(key);
      expect(cached).not.toBeNull();
      expect(cached!.results).toEqual(['fetched-result']);
    });

    it('should return cached result without calling fetcher', async () => {
      const key = buildCacheKey({
        query: 'Cached Content',
        source: 'youtube',
        paramsVersion: 'v1',
        cacheVersion: '1',
      });

      // Pre-populate cache
      const payload: CachedPayload<string[]> = {
        results: ['cached-result'],
        cacheVersion: '1',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      };
      await setCachedResults(key, 'search', payload);

      const fetcher = vi.fn(async () => ['should-not-be-called']);

      const result = await getOrSetWithLock(key, 'search', fetcher);

      expect(fetcher).not.toHaveBeenCalled();
      expect(result).toEqual(['cached-result']);
    });

    it('should deduplicate concurrent requests with advisory locks', async () => {
      const key = buildCacheKey({
        query: 'Concurrent Test',
        source: 'youtube',
        paramsVersion: 'v1',
        cacheVersion: '1',
      });

      let fetchCount = 0;
      const slowFetcher = async () => {
        fetchCount++;
        await new Promise((resolve) => setTimeout(resolve, 200));
        return ['concurrent-result'];
      };

      // Launch concurrent requests
      const [result1, result2, result3] = await Promise.all([
        getOrSetWithLock(key, 'search', slowFetcher),
        getOrSetWithLock(key, 'search', slowFetcher),
        getOrSetWithLock(key, 'search', slowFetcher),
      ]);

      // All should get the same result
      expect(result1).toEqual(['concurrent-result']);
      expect(result2).toEqual(['concurrent-result']);
      expect(result3).toEqual(['concurrent-result']);

      // Fetcher should be called only once (or very few times due to lock contention)
      expect(fetchCount).toBeLessThanOrEqual(2);
    });
  });

  describe('cleanupExpiredCache', () => {
    it('should delete all expired entries', async () => {
      const now = Date.now();

      // Insert 3 expired entries
      for (let i = 0; i < 3; i++) {
        const key = buildCacheKey({
          query: `Expired ${i}`,
          source: 'youtube',
          paramsVersion: 'v1',
          cacheVersion: '1',
        });

        await db.insert(resourceSearchCache).values({
          queryKey: key.queryKey,
          source: key.source,
          params: { stage: 'search', cacheVersion: '1' },
          results: [`result-${i}`],
          expiresAt: new Date(now - 1000), // 1 second ago
        });
      }

      // Insert 2 valid entries
      for (let i = 0; i < 2; i++) {
        const key = buildCacheKey({
          query: `Valid ${i}`,
          source: 'doc',
          paramsVersion: 'v1',
          cacheVersion: '1',
        });

        await db.insert(resourceSearchCache).values({
          queryKey: key.queryKey,
          source: key.source,
          params: { stage: 'docs-head', cacheVersion: '1' },
          results: [`result-${i}`],
          expiresAt: new Date(now + 1000 * 60 * 60), // 1 hour from now
        });
      }

      // Clean up
      const deletedCount = await cleanupExpiredCache();

      expect(deletedCount).toBe(3);

      // Verify only valid entries remain
      const remaining = await db.select().from(resourceSearchCache);
      expect(remaining.length).toBe(2);
    });

    it('should respect limit parameter', async () => {
      const now = Date.now();

      // Insert 5 expired entries
      for (let i = 0; i < 5; i++) {
        const key = buildCacheKey({
          query: `Expired ${i}`,
          source: 'youtube',
          paramsVersion: 'v1',
          cacheVersion: '1',
        });

        await db.insert(resourceSearchCache).values({
          queryKey: key.queryKey,
          source: key.source,
          params: { stage: 'search', cacheVersion: '1' },
          results: [`result-${i}`],
          expiresAt: new Date(now - 1000),
        });
      }

      // Delete only 2
      const deletedCount = await cleanupExpiredCache(2);

      expect(deletedCount).toBe(2);

      // 3 should remain
      const remaining = await db.select().from(resourceSearchCache);
      expect(remaining.length).toBe(3);
    });

    it('should return 0 when no expired entries exist', async () => {
      const deletedCount = await cleanupExpiredCache();
      expect(deletedCount).toBe(0);
    });
  });

  describe('LRU capacity and eviction', () => {
    it('should evict oldest entries when LRU capacity is exceeded', async () => {
      // Set small LRU size before module import
      const originalLRUSize = process.env.CURATION_LRU_SIZE;
      process.env.CURATION_LRU_SIZE = '2';

      // Reset and dynamically import to pick up env change
      vi.resetModules();
      const { lruCache, setCachedResults, getCachedResults, buildCacheKey } =
        await import('@/lib/curation/cache');

      // Create 3 distinct keys
      const key1 = buildCacheKey({
        query: 'key1',
        source: 'youtube',
        paramsVersion: 'v1',
        cacheVersion: '1',
      });
      const key2 = buildCacheKey({
        query: 'key2',
        source: 'youtube',
        paramsVersion: 'v1',
        cacheVersion: '1',
      });
      const key3 = buildCacheKey({
        query: 'key3',
        source: 'youtube',
        paramsVersion: 'v1',
        cacheVersion: '1',
      });

      // Set 3 payloads (key1 oldest)
      const payload1: CachedPayload<string[]> = {
        results: ['result1'],
        cacheVersion: '1',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      };
      await setCachedResults(key1, 'search', payload1);
      const payload2: CachedPayload<string[]> = {
        results: ['result2'],
        cacheVersion: '1',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      };
      await setCachedResults(key2, 'search', payload2);
      const payload3: CachedPayload<string[]> = {
        results: ['result3'],
        cacheVersion: '1',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      };
      await setCachedResults(key3, 'search', payload3);

      // After 3 sets
      expect(lruCache.has(key1)).toBe(false); // Evicted
      expect(lruCache.has(key3)).toBe(true); // Recently added

      const retrieved1 = await getCachedResults<string[]>(key1);
      expect(retrieved1!.results).toEqual(['result1']); // Still retrieved from DB

      // Restore env
      process.env.CURATION_LRU_SIZE = originalLRUSize;
      vi.restoreAllMocks();
    });
  });

  describe('TTL resolution per stage', () => {
    const stages: CacheStage[] = [
      'search',
      'yt-stats',
      'docs-head',
      'negative',
    ];
    const stageEnvVars = {
      search: 'CURATION_CACHE_TTL_SEARCH_DAYS',
      'yt-stats': 'CURATION_CACHE_TTL_YT_STATS_DAYS',
      'docs-head': 'CURATION_CACHE_TTL_DOCS_HEAD_DAYS',
      negative: 'CURATION_NEGATIVE_CACHE_TTL_HOURS',
    };

    stages.forEach((stage) => {
      it(`should apply correct TTL for ${stage} stage`, async () => {
        const originalEnv = process.env[stageEnvVars[stage]];
        process.env[stageEnvVars[stage]] = '1'; // 1 day/hour

        vi.resetModules();
        const { setCachedResults, buildCacheKey } = await import(
          '@/lib/curation/cache'
        );

        const key = buildCacheKey({
          query: 'ttl-test',
          source: 'youtube',
          paramsVersion: 'v1',
          cacheVersion: '1',
        });
        const now = Date.now();
        const payload: CachedPayload<string[]> = {
          results: ['ttl-result'],
          cacheVersion: '1',
          expiresAt: new Date(now + 3600000).toISOString(),
        };
        await setCachedResults(key, stage, payload);

        // Read from DB to verify expiresAt
        const rows = await db
          .select()
          .from(resourceSearchCache)
          .where(eq(resourceSearchCache.queryKey, key.queryKey));
        expect(rows.length).toBe(1);
        const expiresAt = new Date(rows[0].expiresAt).getTime();
        const expectedTTL = stage === 'negative' ? 3600000 : 86400000; // 1 hour vs 1 day
        const tolerance = 2000; // 2s
        expect(Math.abs(expiresAt - (now + expectedTTL))).toBeLessThanOrEqual(
          tolerance
        );

        // Restore env
        process.env[stageEnvVars[stage]] = originalEnv;
        vi.restoreAllMocks();
      });
    });
  });

  describe('Cache version invalidation', () => {
    it('should miss cache when version changes', async () => {
      const baseParams = {
        query: 'Version Test',
        source: 'youtube' as const,
        paramsVersion: 'v1',
      };

      // Cache with version 1
      const key1 = buildCacheKey({ ...baseParams, cacheVersion: '1' });
      const payload1: CachedPayload<string[]> = {
        results: ['v1-result'],
        cacheVersion: '1',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      };
      await setCachedResults(key1, 'search', payload1);

      // Try to retrieve with version 2
      const key2 = buildCacheKey({ ...baseParams, cacheVersion: '2' });
      const retrieved = await getCachedResults(key2);

      expect(retrieved).toBeNull();
    });
  });

  describe('Negative cache behavior', () => {
    it('should cache empty results with negative TTL', async () => {
      const key = buildCacheKey({
        query: 'No Results',
        source: 'youtube',
        paramsVersion: 'v1',
        cacheVersion: '1',
      });

      const payload: CachedPayload<unknown[]> = {
        results: [],
        cacheVersion: '1',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      };

      await setCachedResults(key, 'negative', payload);

      const retrieved = await getCachedResults<unknown[]>(key);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.results).toEqual([]);

      const rows = await db.select().from(resourceSearchCache);
      expect(rows.length).toBe(1);
      expect(rows[0].params.stage).toBe('negative');
    });
  });
});
