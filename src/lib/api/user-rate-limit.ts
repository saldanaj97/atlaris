import type { SlidingWindowLimiter } from '@/lib/api/types/rate-limit-core.types';

import { createSlidingWindowLimiter } from '@/lib/api/rate-limit-core';

type UserRateLimitConfig = {
  maxRequests: number;
  windowMs: number;
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
   * HIGH COST - full module lesson batch (many tasks in one AI call).
   * Separate from `aiGeneration` so plan flows are not starved.
   */
  lessonGeneration: {
    maxRequests: 5,
    windowMs: 60 * 60 * 1000,
  },

  aiGeneration: {
    maxRequests: 10,
    windowMs: 60 * 60 * 1000,
  },

  /**
   * MEDIUM COST - Plan CRUD, task updates, mutations
   * Database writes that could be abused to create excessive data.
   */
  mutation: {
    maxRequests: 60,
    windowMs: 60 * 1000,
  },

  read: {
    maxRequests: 120,
    windowMs: 60 * 1000,
  },
} as const;

export type UserRateLimitCategory = keyof typeof USER_RATE_LIMIT_CONFIGS;

export function createUserRateLimiter(
  config: UserRateLimitConfig,
): SlidingWindowLimiter {
  return createSlidingWindowLimiter({
    maxRequests: config.maxRequests,
    windowMs: config.windowMs,
    maxTrackedKeys: config.maxTrackedUsers ?? 50_000,
    formatErrorMessage: (maxRequests, windowMs) =>
      `Rate limit exceeded. Maximum ${maxRequests} requests allowed per ${formatWindow(windowMs)}.`,
  });
}

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

const rateLimiters = new Map<UserRateLimitCategory, SlidingWindowLimiter>();

function getRateLimiter(category: UserRateLimitCategory): SlidingWindowLimiter {
  const existing = rateLimiters.get(category);
  if (existing) {
    return existing;
  }
  const limiter = createUserRateLimiter(USER_RATE_LIMIT_CONFIGS[category]);
  rateLimiters.set(category, limiter);
  return limiter;
}

export function checkUserRateLimit(
  userId: string,
  category: UserRateLimitCategory,
): void {
  const limiter = getRateLimiter(category);
  limiter.check(userId);
}

export function getUserRateLimitHeaders(
  userId: string,
  category: UserRateLimitCategory,
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

export function clearAllUserRateLimiters(): void {
  for (const limiter of rateLimiters.values()) {
    limiter.clear();
  }
  rateLimiters.clear();
}
