import { RateLimitError } from '@/lib/api/errors';
import { getUserJobCount } from '@/lib/jobs/queue';
import { JOB_TYPES } from '@/lib/jobs/types';

/**
 * Rate limiting configuration for plan generation
 */
const PLAN_GENERATION_LIMIT = 10; // Max jobs per time window
const PLAN_GENERATION_WINDOW_MINUTES = 60; // Time window in minutes

/**
 * Checks if a user has exceeded the rate limit for plan generation jobs
 * @param userId - The internal database user ID
 * @throws RateLimitError if rate limit is exceeded
 */
export async function checkPlanGenerationRateLimit(
  userId: string
): Promise<void> {
  const windowStart = new Date(
    Date.now() - PLAN_GENERATION_WINDOW_MINUTES * 60 * 1000
  );

  const jobCount = await getUserJobCount(
    userId,
    JOB_TYPES.PLAN_GENERATION,
    windowStart
  );

  if (jobCount >= PLAN_GENERATION_LIMIT) {
    const retryAfter = PLAN_GENERATION_WINDOW_MINUTES * 60; // seconds
    throw new RateLimitError(
      `Rate limit exceeded. Maximum ${PLAN_GENERATION_LIMIT} plan generation requests allowed per ${PLAN_GENERATION_WINDOW_MINUTES} minutes.`,
      { retryAfter }
    );
  }
}
