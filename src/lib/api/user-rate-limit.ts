/**
 * User-based rate limiting for authenticated endpoints.
 *
 * This module provides rate limiting keyed by user ID rather than IP.
 * It's designed to prevent authenticated users from overwhelming the system, regardless
 * of whether they're paying customers.
 *
 * IMPORTANT: Storage scope and deployment considerations
 * - Uses an in-memory LRU cache per process (same caveats as ip-rate-limit.ts).
 * - In multi-instance deployments, each instance enforces its own limits.
 * - For strict per-user limits across instances, consider Redis-backed storage.
 *
 * Design principles:
 * - Limits are categorized by endpoint "cost" (high/medium/low).
 * - High-cost endpoints (AI generation, exports) have strict limits.
 * - Low-cost endpoints (reads) have permissive limits.
 * - All limits are per-user, not per-IP (authenticated context required).
 */

import { createSlidingWindowLimiter } from '@/lib/api/rate-limit-core';
import type { SlidingWindowLimiter } from '@/lib/api/types/rate-limit-core.types';

/**
 * Configuration for user-based rate limiting
 */
type UserRateLimitConfig = {
  /** Maximum requests allowed within the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum unique users to track (LRU eviction) */
  maxTrackedUsers?: number;
};

/**
 * Endpoint cost categories for rate limiting.
 *
 * Categories are based on:
 * 1. Computational cost (AI calls are expensive)
 * 2. External API calls (third-party integrations)
 * 3. Database write intensity
 * 4. Potential for abuse
 */
export const USER_RATE_LIMIT_CONFIGS = {
  /**
   * HIGH COST - AI generation, regeneration, content enhancement
   * These endpoints call external AI providers and can be expensive.
   * Strict limits to prevent runaway costs and abuse.
   */
  aiGeneration: {
    maxRequests: 10,
    windowMs: 60 * 60 * 1000, // 10 requests per hour
  },

  /**
   * MEDIUM-HIGH COST - Third-party integrations (Google Calendar)
   * External API calls with rate limits on the provider side.
   * Balance between usability and preventing provider rate limits.
   */
  integration: {
    maxRequests: 30,
    windowMs: 60 * 60 * 1000, // 30 requests per hour
  },

  /**
   * MEDIUM COST - Plan CRUD, task updates, mutations
   * Database writes that could be abused to create excessive data.
   */
  mutation: {
    maxRequests: 60,
    windowMs: 60 * 1000, // 60 requests per minute
  },

  /**
   * LOW COST - Status checks, profile reads, preferences
   * Read-heavy endpoints with minimal server load.
   */
  read: {
    maxRequests: 120,
    windowMs: 60 * 1000, // 120 requests per minute
  },

  /**
   * SPECIAL - Stripe operations (checkout, portal)
   * These create real financial transactions.
   */
  billing: {
    maxRequests: 10,
    windowMs: 60 * 1000, // 10 requests per minute
  },

  /**
   * SPECIAL - OAuth flows
   * Auth endpoints need protection from brute force but allow normal flows.
   */
  oauth: {
    maxRequests: 20,
    windowMs: 60 * 60 * 1000, // 20 requests per hour
  },
} as const;

export type UserRateLimitCategory = keyof typeof USER_RATE_LIMIT_CONFIGS;

/**
 * Creates a user-based rate limiter with the given configuration.
 *
 * @param config - Rate limit configuration
 * @returns A rate limiter object with check, remaining, reset, and clear methods
 */
export function createUserRateLimiter(
  config: UserRateLimitConfig
): SlidingWindowLimiter {
  return createSlidingWindowLimiter({
    maxRequests: config.maxRequests,
    windowMs: config.windowMs,
    maxTrackedKeys: config.maxTrackedUsers ?? 50_000,
    formatErrorMessage: (maxRequests, windowMs) =>
      `Rate limit exceeded. Maximum ${maxRequests} requests allowed per ${formatWindow(windowMs)}.`,
  });
}

/**
 * Formats a window duration in milliseconds to a human-readable string.
 */
function formatWindow(windowMs: number): string {
  const seconds = windowMs / 1000;
  if (seconds < 60) {
    return seconds === 1 ? '1 second' : `${seconds} seconds`;
  }
  const minutes = seconds / 60;
  if (minutes < 60) {
    return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  }
  const hours = minutes / 60;
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

// Pre-configured rate limiters for each category
const rateLimiters = new Map<UserRateLimitCategory, SlidingWindowLimiter>();

/**
 * Gets or creates a rate limiter for a specific category.
 */
function getRateLimiter(category: UserRateLimitCategory): SlidingWindowLimiter {
  const existing = rateLimiters.get(category);
  if (existing) {
    return existing;
  }
  const limiter = createUserRateLimiter(USER_RATE_LIMIT_CONFIGS[category]);
  rateLimiters.set(category, limiter);
  return limiter;
}

/**
 * Checks user-based rate limit for a request.
 *
 * @param userId - Authenticated user ID
 * @param category - The cost category of the endpoint
 * @throws RateLimitError if rate limit exceeded
 */
export function checkUserRateLimit(
  userId: string,
  category: UserRateLimitCategory
): void {
  const limiter = getRateLimiter(category);
  limiter.check(userId);
}

/**
 * Gets rate limit headers for a response.
 *
 * @param userId - Authenticated user ID
 * @param category - The cost category of the endpoint
 * @returns Headers object with rate limit information
 */
export function getUserRateLimitHeaders(
  userId: string,
  category: UserRateLimitCategory
): Record<string, string> {
  const limiter = getRateLimiter(category);
  const config = USER_RATE_LIMIT_CONFIGS[category];
  const remaining = limiter.getRemainingRequests(userId);
  const resetTime = limiter.getResetTime(userId);

  return {
    'X-RateLimit-Limit': String(config.maxRequests),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(resetTime),
  };
}

/**
 * Clears all user rate limiters. Useful for testing.
 */
export function clearAllUserRateLimiters(): void {
  for (const limiter of rateLimiters.values()) {
    limiter.clear();
  }
  rateLimiters.clear();
}

/**
 * Resets rate limit for a specific user across all categories.
 * Useful for testing and admin operations.
 */
export function resetUserRateLimits(userId: string): void {
  for (const limiter of rateLimiters.values()) {
    limiter.reset(userId);
  }
}
