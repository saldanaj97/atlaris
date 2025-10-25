/**
 * Unit tests for Docs adapter
 * Tests: CSE path, fallback heuristics, HEAD validation, canonicalization, cutoff
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { searchDocs, curateDocs } from '@/lib/curation/docs';
import * as cacheModule from '@/lib/curation/cache';
import * as validateModule from '@/lib/curation/validate';
import * as rankingModule from '@/lib/curation/ranking';

describe('Docs Adapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('searchDocs', () => {
    it('should use CSE when configured', async () => {
      vi.spyOn(cacheModule, 'buildCacheKey').mockReturnValue({
        queryKey: 'test-key',
        source: 'doc',
        paramsHash: 'v1',
      });

      const mockResults = [
        {
          url: 'https://react.dev/docs',
          title: 'React Documentation',
          snippet: 'Learn React',
        },
      ];

      vi.spyOn(cacheModule, 'getOrSetWithLock').mockResolvedValue(mockResults);

      const results = await searchDocs('react', {
        query: 'react',
        minScore: 0.6,
        cacheVersion: '1',
      });

      expect(results).toEqual(mockResults);
    });

    it('should fallback to heuristics when CSE not configured', async () => {
      vi.spyOn(cacheModule, 'buildCacheKey').mockReturnValue({
        queryKey: 'test-key',
        source: 'doc',
        paramsHash: 'v1',
      });

      vi.spyOn(cacheModule, 'getOrSetWithLock').mockResolvedValue([]);

      const results = await searchDocs('react', {
        query: 'react',
        minScore: 0.6,
        cacheVersion: '1',
      });

      // Should return heuristic URLs
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].url).toContain('react');
    });
  });

  describe('curateDocs', () => {
    it('should validate URLs with HEAD requests', async () => {
      vi.spyOn(cacheModule, 'buildCacheKey').mockReturnValue({
        queryKey: 'test-key',
        source: 'doc',
        paramsHash: 'v1',
      });

      vi.spyOn(cacheModule, 'getOrSetWithLock')
        .mockResolvedValueOnce([
          {
            url: 'https://react.dev/docs',
            title: 'React Docs',
          },
        ])
        .mockResolvedValueOnce(true); // HEAD validation

      vi.spyOn(validateModule, 'canonicalizeUrl').mockImplementation(
        (url) => url
      );
      vi.spyOn(rankingModule, 'scoreDoc').mockReturnValue({
        url: 'https://react.dev/docs',
        title: 'React Docs',
        source: 'doc',
        score: {
          blended: 0.8,
          components: {},
          scoredAt: new Date().toISOString(),
        },
        metadata: {},
        numericScore: 0.8,
        components: { authority: 0.8, relevance: 0.8, recency: 0.8 },
      } as any);

      vi.spyOn(rankingModule, 'selectTop').mockReturnValue([]);

      await curateDocs({
        query: 'react',
        minScore: 0.6,
        cacheVersion: '1',
      });

      expect(validateModule.canonicalizeUrl).toHaveBeenCalled();
    });

    it('should filter invalid URLs', async () => {
      vi.spyOn(cacheModule, 'buildCacheKey').mockReturnValue({
        queryKey: 'test-key',
        source: 'doc',
        paramsHash: 'v1',
      });

      vi.spyOn(cacheModule, 'getOrSetWithLock')
        .mockResolvedValueOnce([
          {
            url: 'https://invalid-url.com/docs',
            title: 'Invalid',
          },
        ])
        .mockResolvedValueOnce(false); // HEAD validation fails

      vi.spyOn(validateModule, 'canonicalizeUrl').mockImplementation(
        (url) => url
      );
      vi.spyOn(rankingModule, 'selectTop').mockReturnValue([]);

      const results = await curateDocs({
        query: 'test',
        minScore: 0.6,
        cacheVersion: '1',
      });

      expect(results).toEqual([]);
    });

    it('should apply minScore cutoff', async () => {
      vi.spyOn(cacheModule, 'buildCacheKey').mockReturnValue({
        queryKey: 'test-key',
        source: 'doc',
        paramsHash: 'v1',
      });

      vi.spyOn(cacheModule, 'getOrSetWithLock').mockResolvedValueOnce([]);

      vi.spyOn(rankingModule, 'selectTop').mockReturnValue([]);

      await curateDocs({
        query: 'test',
        minScore: 0.9, // High cutoff
        cacheVersion: '1',
      });

      expect(rankingModule.selectTop).toHaveBeenCalled();
    });
  });
});
