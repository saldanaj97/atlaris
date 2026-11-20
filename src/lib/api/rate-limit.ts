import type {
  AttemptsReadClient,
  UserGenerationAttemptWindowStats,
} from '@/lib/db/queries/types/attempts.types';

import { RateLimitError } from '@/lib/api/errors';
import { selectUserGenerationAttemptWindowStats } from '@/lib/db/queries/helpers/attempts-rate-limit';
import { logger } from '@/lib/logging/logger';
import {
  getPlanGenerationWindowStart,
  PLAN_GENERATION_LIMIT,
  PLAN_GENERATION_WINDOW_MINUTES,
} from '@/shared/constants/generation';

export type PlanGenerationRateLimitResult = {
  remaining: number;
  limit: number;
  /** Unix timestamp in whole seconds since epoch (UTC), not milliseconds. Matches `X-RateLimit-Reset` from {@link getPlanGenerationRateLimitHeaders}. */
  reset: number;
};

function planGenerationWindowSeconds(): number {
  return PLAN_GENERATION_WINDOW_MINUTES * 60;
}

function exceededPlanGenerationWindowTiming(
  nowMs: number,
  countFailed: boolean,
  oldestAttempt: Date | null,
  windowSeconds: number,
): { retryAfter: number; reset: number } {
  if (countFailed) {
    const retryAfter = windowSeconds;
    return { retryAfter, reset: Math.ceil(nowMs / 1000) + retryAfter };
  }

  const retryAfter = oldestAttempt
    ? Math.max(
        0,
        Math.floor(
          (oldestAttempt.getTime() + windowSeconds * 1000 - nowMs) / 1000,
        ),
      )
    : windowSeconds;
  const reset = oldestAttempt
    ? Math.ceil((oldestAttempt.getTime() + windowSeconds * 1000) / 1000)
    : Math.ceil(nowMs / 1000) + retryAfter;
  return { retryAfter, reset };
}

function successPlanGenerationReset(
  nowMs: number,
  oldestAttempt: Date | null,
  windowSeconds: number,
): number {
  return oldestAttempt
    ? Math.ceil((oldestAttempt.getTime() + windowSeconds * 1000) / 1000)
    : Math.ceil(nowMs / 1000) + windowSeconds;
}

export function getPlanGenerationRateLimitHeaders(
  result: PlanGenerationRateLimitResult,
): Record<string, string> {
  return {
    'X-RateLimit-Remaining': String(Math.max(0, result.remaining)),
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Reset': String(result.reset),
  };
}

export async function checkPlanGenerationRateLimit(
  userId: string,
  dbClient: AttemptsReadClient,
): Promise<PlanGenerationRateLimitResult> {
  const windowStart = getPlanGenerationWindowStart(new Date());

  let attemptWindowStats: UserGenerationAttemptWindowStats;
  let countFailed = false;
  try {
    attemptWindowStats = await selectUserGenerationAttemptWindowStats({
      userId,
      dbClient,
      since: windowStart,
    });
  } catch (err) {
    logger.error(
      {
        error: err,
        userId,
        windowStart: windowStart.toISOString(),
      },
      'selectUserGenerationAttemptWindowStats failed, failing closed',
    );
    attemptWindowStats = {
      count: PLAN_GENERATION_LIMIT,
      oldestAttemptCreatedAt: null,
    };
    countFailed = true;
  }

  const attemptCount = attemptWindowStats.count;
  const windowSeconds = planGenerationWindowSeconds();
  const nowMs = Date.now();

  if (attemptCount >= PLAN_GENERATION_LIMIT) {
    const { retryAfter, reset } = exceededPlanGenerationWindowTiming(
      nowMs,
      countFailed,
      attemptWindowStats.oldestAttemptCreatedAt,
      windowSeconds,
    );
    throw new RateLimitError(
      `Rate limit exceeded. Maximum ${PLAN_GENERATION_LIMIT} plan generation requests allowed per ${PLAN_GENERATION_WINDOW_MINUTES} minutes.`,
      {
        retryAfter,
        remaining: 0,
        limit: PLAN_GENERATION_LIMIT,
        reset,
      },
    );
  }

  const oldestAttempt = attemptWindowStats.oldestAttemptCreatedAt;
  const reset = successPlanGenerationReset(nowMs, oldestAttempt, windowSeconds);

  return {
    remaining: Math.max(0, PLAN_GENERATION_LIMIT - attemptCount),
    limit: PLAN_GENERATION_LIMIT,
    reset,
  };
}
