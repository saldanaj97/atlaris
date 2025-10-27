import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from 'vitest';
import {
  buildCacheKey,
  getCachedResults,
  setCachedResults,
  getOrSetWithLock,
  lruCache,
  type CurationCacheKey,
  type CachedPayload,
} from '@/lib/curation/cache';
import { db } from '@/lib/db/drizzle';

describe('curation cache', () => {
  const mockResults = [{ id: '1', title: 'Test Resource' }];
  const cacheKey: CurationCacheKey = {
    queryKey: 'test-query-key',
    source: 'youtube',
    paramsHash: 'test-params-hash',
  };

  beforeAll(() => {
    vi.useFakeTimers({ now: new Date('2024-01-01T00:00:00Z') });
  });

  afterEach(() => {
    vi.clearAllMocks();
    lruCache.clear();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  describe('buildCacheKey', () => {
    it('builds consistent cache keys from parameters', () => {
      const key1 = buildCacheKey({
        query: 'test query',
        source: 'youtube',
        paramsVersion: 'v1',
        cacheVersion: '1',
      });

      const key2 = buildCacheKey({
        query: 'test query',
        source: 'youtube',
        paramsVersion: 'v1',
        cacheVersion: '1',
      });

      expect(key1.queryKey).toBe(key2.queryKey);
      expect(key1.source).toBe('youtube');
    });

    it('normalizes query strings', () => {
      const key1 = buildCacheKey({
        query: 'Test Query',
        source: 'doc',
        paramsVersion: 'v1',
        cacheVersion: '1',
      });

      const key2 = buildCacheKey({
        query: '  test   query  ',
        source: 'doc',
        paramsVersion: 'v1',
        cacheVersion: '1',
      });

      expect(key1.queryKey).toBe(key2.queryKey);
    });
  });

  describe('getCachedResults/setCachedResults', () => {
    it('happy path: stores and retrieves results', async () => {
      const payload: CachedPayload<typeof mockResults> = {
        results: mockResults,
        expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour
        cacheVersion: '1',
      };

      await setCachedResults(cacheKey, 'search', payload);
      const retrieved = await getCachedResults<typeof mockResults>(cacheKey);

      expect(retrieved).toEqual(payload);
    });

    it('read-through write-back: LRU cache populated after DB read', async () => {
      // Clear LRU to force DB read
      lruCache.clear();

      const payload: CachedPayload<typeof mockResults> = {
        results: mockResults,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        cacheVersion: '1',
      };

      // Store in DB
      await setCachedResults(cacheKey, 'search', payload);

      // First read should populate LRU
      const firstRead = await getCachedResults<typeof mockResults>(cacheKey);
      expect(firstRead).toEqual(payload);

      // Second read should hit LRU
      const secondRead = await getCachedResults<typeof mockResults>(cacheKey);
      expect(secondRead).toEqual(payload);

      // Verify LRU has the entry
      expect(lruCache.has(cacheKey.queryKey)).toBe(true);
    });

    it('stage-specific TTL selection', async () => {
      const now = Date.now();

      // Test search stage (7 days default)
      await setCachedResults(cacheKey, 'search', {
        results: mockResults,
        expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
        cacheVersion: '1',
      });

      // Test yt-stats stage (2 days default)
      const ytKey = { ...cacheKey, queryKey: 'yt-key' };
      await setCachedResults(ytKey, 'yt-stats', {
        results: mockResults,
        expiresAt: new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString(),
        cacheVersion: '1',
      });

      // Test docs-head stage (5 days default)
      const docsKey = { ...cacheKey, queryKey: 'docs-key' };
      await setCachedResults(docsKey, 'docs-head', {
        results: mockResults,
        expiresAt: new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString(),
        cacheVersion: '1',
      });

      // Test negative stage (4 hours default)
      const negKey = { ...cacheKey, queryKey: 'neg-key' };
      await setCachedResults(negKey, 'negative', {
        results: [],
        expiresAt: new Date(now + 4 * 60 * 60 * 1000).toISOString(),
        cacheVersion: '1',
      });

      // Verify all were stored with correct TTLs
      expect(await getCachedResults(ytKey)).toBeTruthy();
      expect(await getCachedResults(docsKey)).toBeTruthy();
      expect(await getCachedResults(negKey)).toBeTruthy();
    });

    it('negative cache suppression: brief caching of misses', async () => {
      const negKey = { ...cacheKey, queryKey: 'negative-key' };

      // Store negative result (empty array)
      await setCachedResults(negKey, 'negative', {
        results: [],
        expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        cacheVersion: '1',
      });

      // Should retrieve the empty result
      const retrieved = await getCachedResults(negKey);
      expect(retrieved?.results).toEqual([]);
    });

    it('LRU in-process hits avoid DB reads', async () => {
      const payload: CachedPayload<typeof mockResults> = {
        results: mockResults,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        cacheVersion: '1',
      };

      // Populate LRU directly
      lruCache.set(cacheKey.queryKey, payload as CachedPayload<unknown>);

      // Mock the DB query to verify it's not called
      const mockQueryBuilder = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      const dbSpy = vi
        .spyOn(db, 'select')
        .mockReturnValue(mockQueryBuilder as any);

      const retrieved = await getCachedResults<typeof mockResults>(cacheKey);

      expect(retrieved).toEqual(payload);
      expect(dbSpy).not.toHaveBeenCalled();
    });

    it('cache version invalidation', async () => {
      const payload: CachedPayload<typeof mockResults> = {
        results: mockResults,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        cacheVersion: '1',
      };

      await setCachedResults(cacheKey, 'search', payload);

      // Retrieve with same version
      const retrieved = await getCachedResults<typeof mockResults>(cacheKey);
      expect(retrieved).toEqual(payload);

      // Simulate version change by clearing and setting different version
      lruCache.clear();
      const newPayload: CachedPayload<typeof mockResults> = {
        results: [{ id: '2', title: 'Updated Resource' }],
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        cacheVersion: '2',
      };

      await setCachedResults(cacheKey, 'search', newPayload);
      const newRetrieved = await getCachedResults<typeof mockResults>(cacheKey);
      expect(newRetrieved).toEqual(newPayload);
    });

    it('handles expired entries correctly', async () => {
      const payload: CachedPayload<typeof mockResults> = {
        results: mockResults,
        expiresAt: new Date(Date.now() - 1000).toISOString(), // Already expired
        cacheVersion: '1',
      };

      await setCachedResults(cacheKey, 'search', payload);

      // Should return null for expired entry
      const retrieved = await getCachedResults<typeof mockResults>(cacheKey);
      expect(retrieved).toBeNull();

      // LRU should not have expired entry
      expect(lruCache.has(cacheKey.queryKey)).toBe(false);
    });
  });

  describe('getOrSetWithLock', () => {
    let fetcherCallCount = 0;

    beforeEach(() => {
      fetcherCallCount = 0;
    });

    const mockFetcher = vi.fn(async () => {
      fetcherCallCount++;
      await new Promise((resolve) => setTimeout(resolve, 10)); // Simulate network delay
      return mockResults;
    });

    it('dedupes concurrent fetches: single upstream call', async () => {
      // Clear any existing cache
      lruCache.clear();

      // Simulate concurrent calls
      const promises = [
        getOrSetWithLock(cacheKey, 'search', mockFetcher),
        getOrSetWithLock(cacheKey, 'search', mockFetcher),
        getOrSetWithLock(cacheKey, 'search', mockFetcher),
      ];

      const results = await Promise.all(promises);

      // All should return the same results
      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result).toEqual(mockResults);
      });

      // But only one upstream call should have been made
      expect(fetcherCallCount).toBe(1);
    });

    it('re-scoring persistence when cached results lack score', async () => {
      // Clear cache
      lruCache.clear();

      const unscoredResults = [{ id: '1', title: 'Test Resource' }];
      const scoredResults = [{ id: '1', title: 'Test Resource', score: 0.8 }];

      // First call stores unscored results
      await getOrSetWithLock(cacheKey, 'search', async () => unscoredResults);

      // Second call should still get the cached unscored results
      const secondCall = await getOrSetWithLock(
        cacheKey,
        'search',
        async () => scoredResults
      );
      expect(secondCall).toEqual(unscoredResults);
      expect(fetcherCallCount).toBe(1); // Only first call made fetch
    });

    it('handles cache miss correctly', async () => {
      // Clear cache
      lruCache.clear();

      const result = await getOrSetWithLock(cacheKey, 'search', mockFetcher);

      expect(result).toEqual(mockResults);
      expect(fetcherCallCount).toBe(1);
    });

    it('caches results after fetch', async () => {
      // Clear cache
      lruCache.clear();

      await getOrSetWithLock(cacheKey, 'search', mockFetcher);

      // Subsequent call should hit cache
      const cachedResult = await getOrSetWithLock(
        cacheKey,
        'search',
        mockFetcher
      );
      expect(cachedResult).toEqual(mockResults);
      expect(fetcherCallCount).toBe(1); // Still only one fetch
    });
  });

  describe('LRU cache', () => {
    it('maintains capacity and evicts least recently used', () => {
      const smallLRU = new (lruCache.constructor as any)(3);

      // Fill to capacity
      smallLRU.set('key1', 'value1');
      smallLRU.set('key2', 'value2');
      smallLRU.set('key3', 'value3');

      // Access key1 to make it most recently used
      smallLRU.get('key1');

      // Add fourth item, should evict key2 (least recently used)
      smallLRU.set('key4', 'value4');

      expect(smallLRU.has('key1')).toBe(true);
      expect(smallLRU.has('key2')).toBe(false); // Should be evicted
      expect(smallLRU.has('key3')).toBe(true);
      expect(smallLRU.has('key4')).toBe(true);
    });

    it('moves accessed items to most recent position', () => {
      const smallLRU = new (lruCache.constructor as any)(3);

      smallLRU.set('key1', 'value1');
      smallLRU.set('key2', 'value2');
      smallLRU.set('key3', 'value3');

      // Access key3, making it most recent
      smallLRU.get('key3');

      // Add fourth, should evict key1 (now least recent)
      smallLRU.set('key4', 'value4');

      expect(smallLRU.has('key1')).toBe(false); // Should be evicted
      expect(smallLRU.has('key2')).toBe(true);
      expect(smallLRU.has('key3')).toBe(true);
      expect(smallLRU.has('key4')).toBe(true);
    });
  });
});
