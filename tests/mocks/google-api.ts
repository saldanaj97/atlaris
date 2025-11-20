import { vi } from 'vitest';

// Mock Google API rate limiter to prevent real API calls in tests
// IMPORTANT: This mock must NOT spread the real module (...actual) because that
// would include the real googleApiRateLimiter singleton which makes real API calls.
// We explicitly mock both exports to prevent any real API calls.
vi.mock('@/lib/utils/google-api-rate-limiter', () => ({
  fetchGoogleApi: vi.fn(async (url: string | URL) => {
    // Return mock responses for Google API endpoints
    const urlString = url.toString();

    // Mock YouTube search API
    if (urlString.includes('youtube/v3/search')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: { videoId: 'mock-video-1' },
              snippet: {
                title: 'Mock YouTube Video',
                channelTitle: 'Mock Channel',
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Mock YouTube videos API
    if (urlString.includes('youtube/v3/videos')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'mock-video-1',
              statistics: { viewCount: '10000' },
              snippet: { publishedAt: new Date().toISOString() },
              contentDetails: { duration: 'PT10M' },
              status: { privacyStatus: 'public', embeddable: true },
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Mock Google Custom Search API
    if (urlString.includes('customsearch/v1')) {
      return new Response(
        JSON.stringify({
          items: [
            {
              link: 'https://example.com/docs',
              title: 'Mock Documentation',
              snippet: 'Mock documentation snippet',
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Default mock response for unknown endpoints
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }),
  // Mock the singleton to prevent any direct usage from making real API calls
  googleApiRateLimiter: {
    fetch: vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
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
