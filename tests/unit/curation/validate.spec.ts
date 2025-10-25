/**
 * Unit tests for validation module
 * Tests: HEAD checks, canonicalization, YouTube status rules
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canonicalizeUrl,
  headOk,
  isYouTubeEmbeddable,
} from '@/lib/curation/validate';

describe('Validation Module', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('headOk', () => {
    it('should return ok:true for successful 200 response', async () => {
      global.fetch = vi.fn(async () => ({
        status: 200,
        url: 'https://example.com/page',
        ok: true,
      })) as unknown as typeof fetch;

      const result = await headOk('https://example.com/page');

      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
      expect(result.finalUrl).toBe('https://example.com/page');
    });

    it('should return ok:true for 2xx responses', async () => {
      global.fetch = vi.fn(async () => ({
        status: 204,
        url: 'https://example.com/no-content',
        ok: true,
      })) as unknown as typeof fetch;

      const result = await headOk('https://example.com/no-content');

      expect(result.ok).toBe(true);
      expect(result.status).toBe(204);
    });

    it('should return ok:false for 404 response', async () => {
      global.fetch = vi.fn(async () => ({
        status: 404,
        url: 'https://example.com/not-found',
        ok: false,
      })) as unknown as typeof fetch;

      const result = await headOk('https://example.com/not-found');

      expect(result.ok).toBe(false);
      expect(result.status).toBe(404);
    });

    it('should return ok:false for 5xx server errors', async () => {
      global.fetch = vi.fn(async () => ({
        status: 500,
        url: 'https://example.com/error',
        ok: false,
      })) as unknown as typeof fetch;

      const result = await headOk('https://example.com/error');

      expect(result.ok).toBe(false);
      expect(result.status).toBe(500);
    });

    it('should follow redirects and return final URL', async () => {
      global.fetch = vi.fn(async () => ({
        status: 200,
        url: 'https://example.com/final-page',
        ok: true,
      })) as unknown as typeof fetch;

      const result = await headOk('https://example.com/redirect');

      expect(result.ok).toBe(true);
      expect(result.finalUrl).toBe('https://example.com/final-page');
    });

    it('should handle timeouts gracefully', async () => {
      global.fetch = vi.fn(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => {
              const error = new Error('Timeout');
              error.name = 'AbortError';
              reject(error);
            }, 100);
          })
      ) as unknown as typeof fetch;

      const result = await headOk('https://example.com/slow', 50);

      expect(result.ok).toBe(false);
      expect(result.status).toBeUndefined();
    });

    it('should handle network errors', async () => {
      global.fetch = vi.fn(async () => {
        throw new Error('Network error');
      }) as unknown as typeof fetch;

      const result = await headOk('https://example.com/network-fail');

      expect(result.ok).toBe(false);
      expect(result.status).toBeUndefined();
    });

    it('should use custom timeout', async () => {
      vi.useFakeTimers();

      let _timeoutDuration = 0;
      global.fetch = vi.fn(
        (_url, options) =>
          new Promise((resolve) => {
            const signal = options?.signal as AbortSignal;
            signal?.addEventListener('abort', () => {
              _timeoutDuration = Date.now();
            });

            setTimeout(() => {
              resolve({
                status: 200,
                url: 'https://example.com',
                ok: true,
              });
            }, 100);
          })
      ) as unknown as typeof fetch;

      const result = await headOk('https://example.com', 10000);
      vi.advanceTimersByTime(100);
      await Promise.resolve(); // settle microtasks

      expect(global.fetch).toHaveBeenCalled();
      expect(_timeoutDuration).toBe(0); // no abort
      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);

      vi.useRealTimers();
    });
  });

  describe('isYouTubeEmbeddable', () => {
    it('should return true for public embeddable videos', () => {
      const status = {
        privacyStatus: 'public',
        embeddable: true,
      };

      expect(isYouTubeEmbeddable(status)).toBe(true);
    });

    it('should return true for unlisted embeddable videos', () => {
      const status = {
        privacyStatus: 'unlisted',
        embeddable: true,
      };

      expect(isYouTubeEmbeddable(status)).toBe(true);
    });

    it('should return false for private videos', () => {
      const status = {
        privacyStatus: 'private',
        embeddable: true,
      };

      expect(isYouTubeEmbeddable(status)).toBe(false);
    });

    it('should return false for non-embeddable videos', () => {
      const status = {
        privacyStatus: 'public',
        embeddable: false,
      };

      expect(isYouTubeEmbeddable(status)).toBe(false);
    });

    it('should return false when embeddable is undefined', () => {
      const status = {
        privacyStatus: 'public',
      };

      expect(isYouTubeEmbeddable(status)).toBe(false);
    });

    it('should return false when privacyStatus is undefined', () => {
      const status = {
        embeddable: true,
      };

      expect(isYouTubeEmbeddable(status)).toBe(false);
    });

    it('should handle empty status object', () => {
      const status = {};

      expect(isYouTubeEmbeddable(status)).toBe(false);
    });
  });

  describe('canonicalizeUrl', () => {
    it('should remove utm_ tracking parameters', () => {
      const url =
        'https://example.com/page?utm_source=twitter&utm_medium=social&utm_campaign=spring';
      const canonical = canonicalizeUrl(url);

      expect(canonical).toBe('https://example.com/page');
    });

    it('should remove ref parameter', () => {
      const url = 'https://example.com/page?ref=homepage';
      const canonical = canonicalizeUrl(url);

      expect(canonical).toBe('https://example.com/page');
    });

    it('should remove fbclid parameter', () => {
      const url = 'https://example.com/page?fbclid=abc123';
      const canonical = canonicalizeUrl(url);

      expect(canonical).toBe('https://example.com/page');
    });

    it('should remove gclid parameter', () => {
      const url = 'https://example.com/page?gclid=xyz789';
      const canonical = canonicalizeUrl(url);

      expect(canonical).toBe('https://example.com/page');
    });

    it('should preserve functional query parameters', () => {
      const url = 'https://example.com/search?q=react&page=2&utm_source=email';
      const canonical = canonicalizeUrl(url);

      expect(canonical).toBe('https://example.com/search?q=react&page=2');
    });

    it('should handle URLs with no query parameters', () => {
      const url = 'https://example.com/page';
      const canonical = canonicalizeUrl(url);

      expect(canonical).toBe('https://example.com/page');
    });

    it('should handle URLs with only tracking parameters', () => {
      const url = 'https://example.com/page?utm_source=google';
      const canonical = canonicalizeUrl(url);

      expect(canonical).toBe('https://example.com/page');
    });

    it('should handle multiple tracking parameters', () => {
      const url =
        'https://example.com/page?utm_source=google&ref=sidebar&fbclid=abc&gclid=xyz&_ga=123';
      const canonical = canonicalizeUrl(url);

      expect(canonical).toBe('https://example.com/page');
    });

    it('should preserve hash fragments', () => {
      const url = 'https://example.com/page?utm_source=email#section';
      const canonical = canonicalizeUrl(url);

      expect(canonical).toBe('https://example.com/page#section');
    });

    it('should handle invalid URLs gracefully', () => {
      const url = 'not-a-valid-url';
      const canonical = canonicalizeUrl(url);

      expect(canonical).toBe('not-a-valid-url');
    });

    it('should preserve YouTube video IDs', () => {
      const url =
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&utm_source=share';
      const canonical = canonicalizeUrl(url);

      expect(canonical).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    });
  });
});
