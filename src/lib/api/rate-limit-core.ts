import type { SlidingWindowLimiter } from '@/lib/api/types/rate-limit-core.types';

import { RateLimitError } from '@/lib/api/errors';
import { LRUCache } from 'lru-cache';

interface WindowEntry {
  timestamps: number[];
}

type SlidingWindowConfig = {
  maxRequests: number;
  windowMs: number;
  maxTrackedKeys?: number;
  formatErrorMessage?: (maxRequests: number, windowMs: number) => string;
};

function defaultFormatError(maxRequests: number, windowMs: number): string {
  return `Rate limit exceeded. Maximum ${maxRequests} requests allowed per ${Math.round(windowMs / 1000)} seconds.`;
}

export function createSlidingWindowLimiter(
  config: SlidingWindowConfig,
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
      cache.set(key, { timestamps });
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
