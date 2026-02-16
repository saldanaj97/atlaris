import {
  getPlanGenerationWindowStart,
  PLAN_GENERATION_LIMIT,
  PLAN_GENERATION_WINDOW_MINUTES,
} from '@/lib/ai/generation-policy';
import { RateLimitError } from '@/lib/api/errors';
import {
  countUserGenerationAttemptsSince,
  getOldestUserGenerationAttemptSince,
} from '@/lib/db/queries/attempts';
import type { AttemptsDbClient } from '@/lib/db/queries/attempts.types';
import { logger } from '@/lib/logging/logger';

export interface PlanGenerationRateLimitResult {
  limit: number;
  remaining: number;
  reset: number;
}

export function getPlanGenerationRateLimitHeaders(info: {
  limit: number;
  remaining: number;
  reset: number | Date;
}): Record<string, string> {
  const resetUnixSeconds =
    info.reset instanceof Date
      ? Math.ceil(info.reset.getTime() / 1000)
      : Math.ceil(info.reset);

  return {
    'X-RateLimit-Limit': String(info.limit),
    'X-RateLimit-Remaining': String(Math.max(0, info.remaining)),
    'X-RateLimit-Reset': String(Math.max(0, resetUnixSeconds)),
  };
}

/**
 * Checks if the current user has exceeded the durable generation rate limit.
 * Uses generation_attempts count (actual execution path) instead of job queue.
 *
 * @param userId - Internal user id (from users table) to enforce per-user limit
 * @param dbClient - Database client for querying generation_attempts
 * @returns Remaining requests in the durable plan generation window
 * @throws RateLimitError if rate limit is exceeded
 */
export async function checkPlanGenerationRateLimit(
  userId: string,
  dbClient: AttemptsDbClient
): Promise<PlanGenerationRateLimitResult> {
  const windowStart = getPlanGenerationWindowStart(new Date());
  const windowSeconds = PLAN_GENERATION_WINDOW_MINUTES * 60;

  let attemptCount: number;
  let countFailed = false;
  try {
    attemptCount = await countUserGenerationAttemptsSince({
      userId,
      dbClient,
      since: windowStart,
    });
  } catch (err) {
    // Fail-closed: when we cannot verify the count, treat as rate-limited to
    // prevent abuse when DB is unavailable (expensive AI calls).
    logger.error(
      {
        error: err,
        userId,
        windowStart: windowStart.toISOString(),
      },
      'countUserGenerationAttemptsSince failed, failing closed'
    );
    attemptCount = PLAN_GENERATION_LIMIT;
    countFailed = true;
  }

  const now = Date.now();
  const fallbackReset = Math.ceil(now / 1000) + windowSeconds;
  let oldestAttempt: Date | null = null;
  if (!countFailed && attemptCount > 0) {
    try {
      oldestAttempt = await getOldestUserGenerationAttemptSince({
        userId,
        dbClient,
        since: windowStart,
      });
    } catch (err) {
      logger.error(
        { error: err, userId },
        'getOldestUserGenerationAttemptSince failed, using fallback reset'
      );
    }
  }

  const reset = oldestAttempt
    ? Math.ceil((oldestAttempt.getTime() + windowSeconds * 1000) / 1000)
    : fallbackReset;

  if (attemptCount >= PLAN_GENERATION_LIMIT) {
    const retryAfter = oldestAttempt
      ? Math.max(
          0,
          Math.floor(
            (oldestAttempt.getTime() + windowSeconds * 1000 - now) / 1000
          )
        )
      : windowSeconds;

    throw new RateLimitError(
      `Rate limit exceeded. Maximum ${PLAN_GENERATION_LIMIT} plan generation requests allowed per ${PLAN_GENERATION_WINDOW_MINUTES} minutes.`,
      {
        retryAfter,
        remaining: 0,
        limit: PLAN_GENERATION_LIMIT,
        reset,
      }
    );
  }

  return {
    limit: PLAN_GENERATION_LIMIT,
    remaining: Math.max(0, PLAN_GENERATION_LIMIT - attemptCount),
    reset,
  };
}
