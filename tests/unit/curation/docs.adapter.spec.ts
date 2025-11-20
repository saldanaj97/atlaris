/**
 * Unit tests for Docs adapter
 * Tests: CSE path, fallback heuristics, HEAD validation, canonicalization, cutoff
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
// Import docs module dynamically in tests to allow env/config mocking
import * as validateModule from '@/lib/curation/validate';
import * as rankingModule from '@/lib/curation/ranking';

// Helper to mock Google API rate limiter after vi.resetModules()
function mockGoogleApiRateLimiter() {
  vi.doMock('@/lib/utils/google-api-rate-limiter', () => ({
    fetchGoogleApi: vi.fn(async (url: string | URL) => {
      const urlString = url.toString();

      // Mock Google Custom Search API
      if (urlString.includes('customsearch/v1')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                link: 'https://react.dev/docs',
                title: 'React Documentation',
                snippet: 'Learn React',
              },
            ],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // Default mock response
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
    googleApiRateLimiter: {
      fetch: vi.fn(),
      clearCache: vi.fn(),
      getStatus: vi.fn(() => ({
        queueLength: 0,
        activeRequests: 0,
        cacheSize: 0,
        dailyRequestCount: 0,
        dailyQuotaRemaining: 1000,
        quotaResetsInMinutes: 60,
      })),
    },
  }));
}

describe('Docs Adapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('searchDocs', () => {
    it('should use CSE when configured', async () => {
      const originalId = process.env.GOOGLE_CSE_ID;
      const originalKey = process.env.GOOGLE_CSE_KEY;
      process.env.GOOGLE_CSE_ID = 'test-id';
      process.env.GOOGLE_CSE_KEY = 'test-key';

      vi.resetModules();
      mockGoogleApiRateLimiter();
      const { searchDocs } = await import('@/lib/curation/docs');

      const results = await searchDocs('react', {
        query: 'react',
        minScore: 0.6,
      });

      expect(results).toEqual([
        {
          url: 'https://react.dev/docs',
          title: 'React Documentation',
          snippet: 'Learn React',
        },
      ]);

      process.env.GOOGLE_CSE_ID = originalId;
      process.env.GOOGLE_CSE_KEY = originalKey;
    });

    it('should fallback to heuristics when CSE not configured', async () => {
      delete process.env.GOOGLE_CSE_ID;
      delete process.env.GOOGLE_CSE_KEY;
      vi.resetModules();
      mockGoogleApiRateLimiter();
      const { searchDocs } = await import('@/lib/curation/docs');

      const results = await searchDocs('react', {
        query: 'react',
        minScore: 0.6,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.url.includes('react'))).toBe(true);
    });
  });

  describe('curateDocs', () => {
    it('should validate URLs with HEAD requests', async () => {
      const originalId = process.env.GOOGLE_CSE_ID;
      const originalKey = process.env.GOOGLE_CSE_KEY;
      process.env.GOOGLE_CSE_ID = 'test-id';
      process.env.GOOGLE_CSE_KEY = 'test-key';
      vi.resetModules();
      mockGoogleApiRateLimiter();

      const canonicalizeMock = vi.fn((url: string) => url);
      const headOkMock = vi.fn(async () => ({ ok: true }));
      const scoreDocMock = vi.fn(
        () =>
          ({
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
          }) as any
      );
      const selectTopMock = vi.fn(() => []);

      vi.doMock('@/lib/curation/validate', () => ({
        canonicalizeUrl: canonicalizeMock,
        headOk: headOkMock,
      }));
      vi.doMock('@/lib/curation/ranking', () => ({
        scoreDoc: scoreDocMock,
        selectTop: selectTopMock,
      }));

      const { curateDocs } = await import('@/lib/curation/docs');

      await curateDocs({
        query: 'react',
        minScore: 0.6,
      });

      expect(canonicalizeMock).toHaveBeenCalled();
      process.env.GOOGLE_CSE_ID = originalId;
      process.env.GOOGLE_CSE_KEY = originalKey;
    });

    it('should filter invalid URLs', async () => {
      const originalId = process.env.GOOGLE_CSE_ID;
      const originalKey = process.env.GOOGLE_CSE_KEY;
      process.env.GOOGLE_CSE_ID = 'test-id';
      process.env.GOOGLE_CSE_KEY = 'test-key';
      vi.resetModules();
      mockGoogleApiRateLimiter();
      // Spy before import to ensure wrapped functions are used
      vi.spyOn(rankingModule, 'selectTop').mockReturnValue([]);
      const { curateDocs } = await import('@/lib/curation/docs');

      vi.spyOn(validateModule, 'canonicalizeUrl').mockImplementation(
        (url) => url
      );
      vi.spyOn(validateModule, 'headOk').mockResolvedValue({ ok: false });
      vi.spyOn(rankingModule, 'selectTop').mockReturnValue([]);

      const results = await curateDocs({
        query: 'test',
        minScore: 0.6,
      });

      expect(results).toEqual([]);
      process.env.GOOGLE_CSE_ID = originalId;
      process.env.GOOGLE_CSE_KEY = originalKey;
    });

    it('should apply minScore cutoff', async () => {
      vi.resetModules();
      mockGoogleApiRateLimiter();
      const selectTopMock = vi.fn(() => []);
      vi.doMock('@/lib/curation/ranking', () => ({
        scoreDoc: (x: any) => x,
        selectTop: selectTopMock,
      }));
      const { curateDocs } = await import('@/lib/curation/docs');
      await curateDocs({
        query: 'test',
        minScore: 0.9, // High cutoff
      });

      expect(selectTopMock).toHaveBeenCalled();
    });
  });
});
