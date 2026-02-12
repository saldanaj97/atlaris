import {
  getPlanGenerationWindowStart,
  PLAN_GENERATION_LIMIT,
  PLAN_GENERATION_WINDOW_MINUTES,
} from '@/lib/ai/generation-policy';
import { RateLimitError } from '@/lib/api/errors';
import {
  countUserGenerationAttemptsSince,
  getOldestUserGenerationAttemptSince,
  type AttemptsDbClient,
} from '@/lib/db/queries/attempts';
import { logger } from '@/lib/logging/logger';

export interface PlanGenerationRateLimitResult {
  remaining: number;
}

export function getPlanGenerationRateLimitHeaders(
  remaining: number
): Record<string, string> {
  return {
    'X-RateLimit-Remaining': String(Math.max(0, remaining)),
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

  let attemptCount: number;
  let countFailed = false;
  try {
    attemptCount = await countUserGenerationAttemptsSince(
      userId,
      dbClient,
      windowStart
    );
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

  if (attemptCount >= PLAN_GENERATION_LIMIT) {
    let retryAfter: number;
    if (countFailed) {
      // Fail-closed policy: when count cannot be verified, return full-window
      // retry-after to avoid under-throttling expensive generation requests.
      retryAfter = PLAN_GENERATION_WINDOW_MINUTES * 60;
    } else {
      try {
        const oldestAttempt = await getOldestUserGenerationAttemptSince(
          userId,
          dbClient,
          windowStart
        );
        const windowSeconds = PLAN_GENERATION_WINDOW_MINUTES * 60;
        retryAfter = oldestAttempt
          ? Math.max(
              0,
              Math.floor(
                (oldestAttempt.getTime() + windowSeconds * 1000 - Date.now()) /
                  1000
              )
            )
          : windowSeconds;
      } catch (err) {
        logger.error(
          { error: err, userId },
          'getOldestUserGenerationAttemptSince failed, using fallback retry-after'
        );
        retryAfter = PLAN_GENERATION_WINDOW_MINUTES * 60;
      }
    }
    throw new RateLimitError(
      `Rate limit exceeded. Maximum ${PLAN_GENERATION_LIMIT} plan generation requests allowed per ${PLAN_GENERATION_WINDOW_MINUTES} minutes.`,
      { retryAfter, remaining: 0 }
    );
  }

  return {
    remaining: Math.max(0, PLAN_GENERATION_LIMIT - attemptCount),
  };
}
