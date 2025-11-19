/**
 * Google API Rate Limiter with Queue and Exponential Backoff
 *
 * This utility provides:
 * - Request queuing to limit concurrent API calls
 * - Exponential backoff retry logic for rate limit errors
 * - Error detection for 429/500 status codes
 * - Simple in-memory caching to reduce redundant requests
 */

import { logger } from '@/lib/logging/logger';

interface QueueItem {
  fn: () => Promise<Response>;
  resolve: (value: Response) => void;
  reject: (error: Error) => void;
  retries: number;
  cacheKey?: string;
}

interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  shouldRetry?: (error: Error, response?: Response) => boolean;
}

interface RateLimiterOptions {
  maxConcurrent?: number;
  minDelay?: number;
}

interface CacheEntry {
  data: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    contentType: string;
  };
  timestamp: number;
}

class GoogleApiRateLimiter {
  private queue: QueueItem[] = [];
  private activeRequests = 0;
  private maxConcurrent: number;
  private minDelay: number;
  private lastRequestTime = 0;
  private cache = new Map<string, CacheEntry>();
  private readonly cacheTTL = 5 * 60 * 1000; // 5 minutes
  private isProcessing = false; // Flag to prevent concurrent processing

  // Daily quota tracking (resets at midnight UTC)
  private dailyRequestCount = 0;
  private dailyQuotaLimit = 1000; // 1k requests per day
  private quotaResetTime = this.getNextMidnightUTC();

  constructor(options: RateLimiterOptions = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 3; // Conservative default
    this.minDelay = options.minDelay ?? 100; // 100ms between requests
  }

  /**
   * Get next midnight UTC timestamp
   */
  private getNextMidnightUTC(): number {
    const now = new Date();
    const midnight = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0,
        0,
        0
      )
    );
    return midnight.getTime();
  }

  /**
   * Check and reset daily quota if needed
   */
  private checkDailyQuota(): void {
    const now = Date.now();
    if (now >= this.quotaResetTime) {
      // Reset quota at midnight UTC
      this.dailyRequestCount = 0;
      this.quotaResetTime = this.getNextMidnightUTC();
      logger.info('Daily Google API quota reset');
    }

    // Check if we've exceeded daily quota
    if (this.dailyRequestCount >= this.dailyQuotaLimit) {
      const resetIn = Math.ceil((this.quotaResetTime - now) / 1000 / 60);
      throw new Error(
        `Daily Google API quota exceeded (${this.dailyQuotaLimit} requests/day). ` +
          `Quota resets in ${resetIn} minutes.`
      );
    }
  }

  /**
   * Increment daily request counter
   */
  private incrementDailyCounter(): void {
    this.dailyRequestCount++;
  }

  /**
   * Execute a fetch request with rate limiting, queueing, and retry logic
   */
  async fetch(
    url: string | URL,
    options?: RequestInit,
    retryOptions: RetryOptions = {}
  ): Promise<Response> {
    const {
      maxRetries = 5,
      baseDelay = 1000,
      maxDelay = 32000,
      shouldRetry = this.defaultShouldRetry,
    } = retryOptions;

    // Generate cache key for GET requests
    const cacheKey =
      !options?.method || options.method === 'GET'
        ? this.getCacheKey(url, options)
        : undefined;

    // Check cache first
    if (cacheKey) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        logger.debug({ cacheKey }, 'Returning cached Google API response');
        return cached.clone(); // Clone to allow multiple reads
      }
    }

    return new Promise((resolve, reject) => {
      const queueItem: QueueItem = {
        fn: async () => {
          try {
            // Check daily quota before making request
            this.checkDailyQuota();

            const response = await this.executeWithRetry(
              url,
              options,
              maxRetries,
              baseDelay,
              maxDelay,
              shouldRetry
            );

            // Increment daily counter after successful request
            this.incrementDailyCounter();

            // Cache successful GET responses
            if (cacheKey && response.ok) {
              await this.addToCache(cacheKey, response);
            }

            return response;
          } catch (error) {
            throw error;
          }
        },
        resolve,
        reject,
        retries: 0,
        cacheKey,
      };

      this.enqueue(queueItem);
    });
  }

  /**
   * Execute request with exponential backoff retry logic
   */
  private async executeWithRetry(
    url: string | URL,
    options: RequestInit | undefined,
    maxRetries: number,
    baseDelay: number,
    maxDelay: number,
    shouldRetry: (error: Error, response?: Response) => boolean
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Enforce minimum delay between requests
        await this.enforceDelay();

        const response = await fetch(url, options);

        // Check if we should retry based on response
        if (
          !response.ok &&
          shouldRetry(new Error(`HTTP ${response.status}`), response)
        ) {
          lastError = new Error(
            `Google API error: ${response.status} ${response.statusText}`
          );

          // Log rate limit detection
          if (response.status === 429 || response.status === 500) {
            logger.warn(
              {
                url: url.toString(),
                status: response.status,
                attempt: attempt + 1,
                maxRetries: maxRetries + 1,
              },
              'Google API rate limit or server error detected, retrying...'
            );
          }

          // If not last attempt, wait and retry
          if (attempt < maxRetries) {
            const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
            // Add jitter to prevent thundering herd
            const jitter = Math.random() * 0.3 * delay;
            await this.sleep(delay + jitter);
            continue;
          }
        }

        // Success or non-retryable error
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (!shouldRetry(lastError)) {
          throw lastError;
        }

        // If not last attempt, wait and retry
        if (attempt < maxRetries) {
          const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
          const jitter = Math.random() * 0.3 * delay;

          logger.warn(
            {
              url: url.toString(),
              error: lastError.message,
              attempt: attempt + 1,
              maxRetries: maxRetries + 1,
              delayMs: Math.round(delay + jitter),
            },
            'Google API request failed, retrying...'
          );

          await this.sleep(delay + jitter);
          continue;
        }
      }
    }

    // All retries exhausted
    throw (
      lastError || new Error(`Request failed after ${maxRetries + 1} attempts`)
    );
  }

  /**
   * Default retry logic - retry on network errors and rate limit errors
   */
  private defaultShouldRetry = (error: Error, response?: Response): boolean => {
    // Retry on rate limit errors (429, 500, 503)
    if (response) {
      return (
        response.status === 429 ||
        response.status === 500 ||
        response.status === 503
      );
    }

    // Retry on network errors
    const errorMessage = error.message.toLowerCase();
    return (
      errorMessage.includes('network') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('econnreset') ||
      errorMessage.includes('enotfound')
    );
  };

  /**
   * Add item to queue and process
   */
  private enqueue(item: QueueItem): void {
    this.queue.push(item);
    void this.processQueue();
  }

  /**
   * Process queued requests respecting concurrency limits
   */
  private processQueue(): void {
    // Prevent concurrent execution
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (
        this.queue.length > 0 &&
        this.activeRequests < this.maxConcurrent
      ) {
        const item = this.queue.shift();
        if (!item) continue;

        this.activeRequests++;

        // Execute the request (intentionally not awaited for concurrent processing)
        void item
          .fn()
          .then(item.resolve)
          .catch(item.reject)
          .finally(() => {
            this.activeRequests--;
            void this.processQueue(); // Process next item
          });
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Enforce minimum delay between request starts.
   * With concurrency, the effective rate is: maxConcurrent / minDelay requests per second.
   * For target RPM, minDelay should be: (60000 / targetRPM) / maxConcurrent milliseconds.
   * Example: 15 RPM with maxConcurrent=2 → minDelay = (4000) / 2 = 8000ms
   */
  private async enforceDelay(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minDelay) {
      await this.sleep(this.minDelay - timeSinceLastRequest);
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Generate cache key from URL and options
   */
  private getCacheKey(url: string | URL, options?: RequestInit): string {
    const urlString = url.toString();
    const optionsKey = options ? JSON.stringify(options) : '';
    return `${urlString}:${optionsKey}`;
  }

  /**
   * Get response from cache if not expired
   */
  private getFromCache(key: string): Response | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    // Reconstruct Response from cached data
    const { status, statusText, headers, body, contentType } = entry.data;

    // Create headers object
    const responseHeaders = new Headers();
    Object.entries(headers).forEach(([key, value]) => {
      responseHeaders.set(key, value);
    });

    // Ensure content-type is set
    if (!responseHeaders.has('content-type')) {
      responseHeaders.set('content-type', contentType);
    }

    return new Response(body, {
      status,
      statusText,
      headers: responseHeaders,
    });
  }

  /**
   * Add response to cache
   */
  private async addToCache(key: string, response: Response): Promise<void> {
    try {
      // Clone the response before consuming its body
      const responseClone = response.clone();

      // Extract response metadata and body
      const headers: Record<string, string> = {};
      responseClone.headers.forEach((value, key) => {
        headers[key] = value;
      });

      const body = await responseClone.text();
      const contentType =
        responseClone.headers.get('content-type') || 'text/plain';

      this.cache.set(key, {
        data: {
          status: responseClone.status,
          statusText: responseClone.statusText,
          headers,
          body,
          contentType,
        },
        timestamp: Date.now(),
      });

      // Clean up old cache entries periodically
      if (this.cache.size > 100) {
        this.cleanupCache();
      }
    } catch (error) {
      // If we can't cache the response (e.g., body already consumed), skip caching
      logger.warn(
        { key, error: error instanceof Error ? error.message : String(error) },
        'Failed to cache Google API response'
      );
    }
  }

  /**
   * Remove expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.cacheTTL) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cached responses
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get queue status for debugging
   */
  getStatus() {
    const now = Date.now();
    const quotaResetIn = Math.ceil((this.quotaResetTime - now) / 1000 / 60);

    return {
      queueLength: this.queue.length,
      activeRequests: this.activeRequests,
      cacheSize: this.cache.size,
      dailyRequestCount: this.dailyRequestCount,
      dailyQuotaRemaining: this.dailyQuotaLimit - this.dailyRequestCount,
      quotaResetsInMinutes: quotaResetIn,
    };
  }
}

// Export singleton instance
// Configured to respect Google API rate limits:
// - 15 requests per minute (RPM)
// - 250k tokens per minute (TPM)
// - 1k requests per day (RPD)
// With maxConcurrent: 2 and minDelay: 8000ms = 15 RPM (request starts every 8s with 2 concurrent)
export const googleApiRateLimiter = new GoogleApiRateLimiter({
  maxConcurrent: 2, // Allow 2 concurrent requests
  minDelay: 8000, // 8 seconds between request starts = 15 RPM with 2 concurrent requests
});

/**
 * Convenience function for making rate-limited Google API requests
 */
export async function fetchGoogleApi(
  url: string | URL,
  options?: RequestInit,
  retryOptions?: RetryOptions
): Promise<Response> {
  return googleApiRateLimiter.fetch(url, options, retryOptions);
}
