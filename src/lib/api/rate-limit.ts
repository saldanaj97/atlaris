import { RateLimitError } from '@/lib/api/errors';
import {
  countUserGenerationAttemptsSince,
  getOldestUserGenerationAttemptSince,
  type AttemptsDbClient,
} from '@/lib/db/queries/attempts';
import { logger } from '@/lib/logging/logger';

/**
 * Durable rate limit for plan generation (tied to actual generation_attempts).
 * Aligned with stream and retry execution paths that write to generation_attempts.
 */
const PLAN_GENERATION_LIMIT = 10; // Max attempts per time window
const PLAN_GENERATION_WINDOW_MINUTES = 60; // Time window in minutes

/**
 * Checks if the current user has exceeded the durable generation rate limit.
 * Uses generation_attempts count (actual execution path) instead of job queue.
 *
 * @param userId - Internal user id (from users table) to enforce per-user limit
 * @param dbClient - Database client for querying generation_attempts
 * @throws RateLimitError if rate limit is exceeded
 */
export async function checkPlanGenerationRateLimit(
  userId: string,
  dbClient: AttemptsDbClient
): Promise<void> {
  const windowStart = new Date(
    Date.now() - PLAN_GENERATION_WINDOW_MINUTES * 60 * 1000
  );

  let attemptCount: number;
  try {
    attemptCount = await countUserGenerationAttemptsSince(
      userId,
      dbClient,
      windowStart
    );
  } catch (err) {
    // Fail-closed: when we cannot verify the count, treat as rate-limited to
    // prevent abuse when DB is unavailable (expensive AI calls).
    logger.error('countUserGenerationAttemptsSince failed, failing closed', {
      error: err,
      userId,
      windowStart: windowStart.toISOString(),
    });
    attemptCount = PLAN_GENERATION_LIMIT;
  }

  if (attemptCount >= PLAN_GENERATION_LIMIT) {
    const oldestAttempt = await getOldestUserGenerationAttemptSince(
      userId,
      dbClient,
      windowStart
    );
    const windowSeconds = PLAN_GENERATION_WINDOW_MINUTES * 60;
    const retryAfter = oldestAttempt
      ? Math.max(
          0,
          Math.floor(
            (oldestAttempt.getTime() + windowSeconds * 1000 - Date.now()) / 1000
          )
        )
      : windowSeconds;
    throw new RateLimitError(
      `Rate limit exceeded. Maximum ${PLAN_GENERATION_LIMIT} plan generation requests allowed per ${PLAN_GENERATION_WINDOW_MINUTES} minutes.`,
      { retryAfter }
    );
  }
}
