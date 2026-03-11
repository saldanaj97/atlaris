/**
 * Shared sliding-window rate limiter backed by an LRU cache.
 *
 * Both ip-rate-limit.ts and user-rate-limit.ts delegate to this core
 * implementation.  Keeping a single algorithm avoids drift between the
 * two modules and makes the window logic easier to test in isolation.
 */

import { LRUCache } from 'lru-cache';

import { RateLimitError } from '@/lib/api/errors';

interface WindowEntry {
  timestamps: number[];
}

export interface SlidingWindowConfig {
  /** Maximum requests allowed within the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum keys to track (LRU eviction). Defaults to 10 000. */
  maxTrackedKeys?: number;
  /** Builds the human-readable error message on limit breach. */
  formatErrorMessage?: (maxRequests: number, windowMs: number) => string;
}

export interface SlidingWindowLimiter {
  check: (key: string) => void;
  getRemainingRequests: (key: string) => number;
  getResetTime: (key: string) => number;
  reset: (key: string) => void;
  clear: () => void;
}

function defaultFormatError(maxRequests: number, windowMs: number): string {
  return `Rate limit exceeded. Maximum ${maxRequests} requests allowed per ${Math.round(windowMs / 1000)} seconds.`;
}

/**
 * Creates a sliding-window rate limiter.
 *
 * @returns An object with check / remaining / reset / clear helpers.
 */
export function createSlidingWindowLimiter(
  config: SlidingWindowConfig
): SlidingWindowLimiter {
  const {
    maxRequests,
    windowMs,
    maxTrackedKeys = 10_000,
    formatErrorMessage = defaultFormatError,
  } = config;

  const cache = new LRUCache<string, WindowEntry>({
    max: maxTrackedKeys,
    ttl: windowMs + 1000,
  });

  function check(key: string): void {
    const now = Date.now();
    const entry = cache.get(key);
    const cutoff = now - windowMs;

    const timestamps = entry ? entry.timestamps.filter((t) => t > cutoff) : [];

    if (timestamps.length >= maxRequests) {
      // Don't add this request — it's rejected
      cache.set(key, { timestamps }); // still prune expired entries
      const retryAfter = Math.ceil((timestamps[0] + windowMs - now) / 1000);
      throw new RateLimitError(formatErrorMessage(maxRequests, windowMs), {
        retryAfter,
        limit: maxRequests,
        remaining: 0,
        reset: Math.ceil((timestamps[0] + windowMs) / 1000),
      });
    }

    timestamps.push(now);
    cache.set(key, { timestamps });
  }

  function getRemainingRequests(key: string): number {
    const now = Date.now();
    const entry = cache.get(key);

    if (!entry) return maxRequests;

    const active = entry.timestamps.filter((t) => t > now - windowMs);
    return Math.max(0, maxRequests - active.length);
  }

  function getResetTime(key: string): number {
    const now = Date.now();
    const entry = cache.get(key);

    if (!entry) return Math.ceil((now + windowMs) / 1000);

    const active = entry.timestamps.filter((t) => t > now - windowMs);
    if (active.length === 0) return Math.ceil((now + windowMs) / 1000);

    return Math.ceil((active[0] + windowMs) / 1000);
  }

  function reset(key: string): void {
    cache.delete(key);
  }

  function clear(): void {
    cache.clear();
  }

  return { check, getRemainingRequests, getResetTime, reset, clear };
}
