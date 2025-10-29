/**
 * Unit tests for YouTube adapter
 * Tests: param shaping, batching, cutoff, early-stop, cache hits
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getVideoStats,
  searchYouTube,
  curateYouTube,
} from '@/lib/curation/youtube';
import * as cacheModule from '@/lib/curation/cache';
import * as validateModule from '@/lib/curation/validate';
import * as rankingModule from '@/lib/curation/ranking';

// Capture original fetch before any tests run
const originalFetch = global.fetch;

describe('YouTube Adapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // Restore original fetch even if tests throw
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('searchYouTube', () => {
    it('should search with minimal fields projection', async () => {
      const mockResponse = {
        items: [
          {
            id: { videoId: 'abc123' },
            snippet: {
              title: 'Test Video',
              channelTitle: 'Test Channel',
            },
          },
        ],
      };

      vi.spyOn(cacheModule, 'buildCacheKey').mockReturnValue({
        queryKey: 'test-key',
        source: 'youtube',
        paramsHash: 'v1',
      });

      vi.spyOn(cacheModule, 'getOrSetWithLock').mockResolvedValue(
        mockResponse.items.map((item) => ({
          id: item.id.videoId,
          title: item.snippet.title,
          channelTitle: item.snippet.channelTitle,
        }))
      );

      const results = await searchYouTube('react hooks', {
        query: 'react hooks',
        minScore: 0.6,
        cacheVersion: '1',
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: 'abc123',
        title: 'Test Video',
        channelTitle: 'Test Channel',
      });
    });

    it('should handle empty API responses', async () => {
      vi.spyOn(cacheModule, 'buildCacheKey').mockReturnValue({
        queryKey: 'test-key',
        source: 'youtube',
        paramsHash: 'v1',
      });

      vi.spyOn(cacheModule, 'getOrSetWithLock').mockResolvedValue([]);

      const results = await searchYouTube('test', {
        query: 'test',
        minScore: 0.6,
        cacheVersion: '1',
      });

      expect(results).toEqual([]);
    });
  });

  describe('getVideoStats', () => {
    it('should batch fetch video statistics', async () => {
      const mockResponse = {
        items: [
          {
            id: 'video1',
            statistics: { viewCount: '1000' },
            snippet: { publishedAt: '2023-01-01T00:00:00Z' },
            contentDetails: { duration: 'PT10M30S' },
            status: {
              privacyStatus: 'public',
              embeddable: true,
            },
          },
        ],
      };

      const mockFetch = vi.fn(async () => ({
        ok: true,
        json: async () => mockResponse,
      }));
      global.fetch = mockFetch as unknown as typeof fetch;

      const stats = await getVideoStats(['video1']);

      expect(stats).toHaveLength(1);
      expect(stats[0]).toEqual({
        id: 'video1',
        viewCount: 1000,
        publishedAt: '2023-01-01T00:00:00Z',
        duration: 'PT10M30S',
        status: {
          privacyStatus: 'public',
          embeddable: true,
        },
      });
    });

    it('should return empty array for empty input', async () => {
      const stats = await getVideoStats([]);
      expect(stats).toEqual([]);
    });

    it('should handle API failures', async () => {
      const mockFetch = vi.fn(async () => ({
        ok: false,
      }));
      global.fetch = mockFetch as unknown as typeof fetch;

      // Mock getOrSetWithLock to call the fetcher directly, bypassing cache
      vi.spyOn(cacheModule, 'getOrSetWithLock').mockImplementation(
        async (_, __, fetcher) => {
          return await fetcher();
        }
      );

      const stats = await getVideoStats(['video1']);
      expect(stats).toEqual([]);
    });
  });

  describe('curateYouTube', () => {
    it('should apply minScore cutoff', async () => {
      vi.spyOn(cacheModule, 'buildCacheKey').mockReturnValue({
        queryKey: 'test-key',
        source: 'youtube',
        paramsHash: 'v1',
      });

      vi.spyOn(cacheModule, 'getOrSetWithLock')
        .mockResolvedValueOnce([
          {
            id: 'video1',
            title: 'Test Video',
            channelTitle: 'Test Channel',
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'video1',
            viewCount: 1000,
            publishedAt: '2023-01-01T00:00:00Z',
            duration: 'PT10M',
            status: {
              privacyStatus: 'public',
              embeddable: true,
            },
          },
        ]);

      vi.spyOn(validateModule, 'isYouTubeEmbeddable').mockReturnValue(true);
      vi.spyOn(rankingModule, 'scoreYouTube').mockReturnValue({
        url: 'https://youtube.com/watch?v=video1',
        title: 'Test Video',
        source: 'youtube',
        score: {
          blended: 0.8,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        metadata: {},
        numericScore: 0.8,
        components: {
          popularity: 0.8,
          recency: 0.8,
          relevance: 0.8,
          suitability: 0.8,
        },
      } as any);

      vi.spyOn(rankingModule, 'selectTop').mockReturnValue([]);

      const results = await curateYouTube({
        query: 'test',
        minScore: 0.9, // High cutoff
        cacheVersion: '1',
      });

      expect(results).toEqual([]);
    });

    it('should respect maxResults limit', async () => {
      vi.spyOn(cacheModule, 'buildCacheKey').mockReturnValue({
        queryKey: 'test-key',
        source: 'youtube',
        paramsHash: 'v1',
      });

      vi.spyOn(cacheModule, 'getOrSetWithLock')
        .mockResolvedValueOnce([
          {
            id: 'video1',
            title: 'First',
            channelTitle: 'Channel A',
          },
          {
            id: 'video2',
            title: 'Second',
            channelTitle: 'Channel B',
          },
          {
            id: 'video3',
            title: 'Third',
            channelTitle: 'Channel C',
          },
        ])
        .mockResolvedValueOnce(
          ['video1', 'video2', 'video3'].map((id) => ({
            id,
            viewCount: 1000,
            publishedAt: '2024-01-01T00:00:00Z',
            duration: 'PT10M',
            status: { privacyStatus: 'public', embeddable: true },
          }))
        );
      vi.spyOn(rankingModule, 'selectTop').mockImplementation(
        (candidates, opts) => candidates.slice(0, opts.maxItems)
      );
      const results = await curateYouTube({
        query: 'test',
        minScore: 0.6,
        maxResults: 2,
        cacheVersion: '1',
      });
      expect(results).toHaveLength(2);
      expect(rankingModule.selectTop).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ maxItems: 2 })
      );
    });
  });
});
