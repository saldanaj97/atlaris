import type { DbClient } from '@/lib/db/types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import {
  GLOBAL_AI_DAILY_BUDGET,
  globalAiDailyCeilingMicrousd,
  userAiCeilingMicrousd,
} from '@/features/billing/plan-ai-budget';
import { AppError, ServiceUnavailableError } from '@/lib/api/errors';
import {
  sumAllAiSpendMicrousd,
  sumUserAiSpendMicrousd,
} from '@/lib/db/queries/plan-ai-budget';
import { logger } from '@/lib/logging/logger';
import { API_ERROR_CODES } from '@/shared/constants/api-error-codes';
import * as Sentry from '@sentry/nextjs';
import { db as serviceRoleDb } from '@supabase/service-role';

type SpendReader = Pick<DbClient, 'select'>;

export type AiSpendGuardDeps = {
  /** Service-role client for the all-users sum. */
  readonly serviceDb?: SpendReader;
  readonly now?: () => Date;
};

function startOfUtcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function startOfUtcMonth(now: Date, monthOffset = 0): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, 1),
  );
}

function formatUtcDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** One Sentry issue per alert share per UTC day, so a "new issue" alert fires once a day. */
function reportGlobalSpend(spent: number, ceiling: number, day: string): void {
  const tripped = spent >= ceiling;
  const share = [...GLOBAL_AI_DAILY_BUDGET.alertShares]
    .sort((a, b) => b - a)
    .find((candidate) => spent >= ceiling * candidate);
  if (!tripped && share === undefined) return;

  const percent = tripped ? 100 : Math.round(share! * 100);
  const fields = {
    event: 'ai_global_daily_spend',
    percent,
    spentMicrousd: spent,
    ceilingMicrousd: ceiling,
    day,
  };
  if (tripped) {
    logger.error(fields, 'Global daily AI spend ceiling reached; AI paused');
  } else {
    logger.warn(fields, 'Global daily AI spend passed an alert threshold');
  }
  Sentry.captureMessage(
    tripped
      ? 'Global daily AI spend ceiling reached; new AI work is paused'
      : `Global daily AI spend passed ${percent}% of the ceiling`,
    {
      level: tripped ? 'fatal' : percent >= 80 ? 'error' : 'warning',
      fingerprint: ['ai_global_daily_spend', String(percent), day],
      tags: { event: 'ai_global_daily_spend', percent: String(percent) },
      extra: { spentMicrousd: spent, ceilingMicrousd: ceiling },
    },
  );
}

/**
 * Admission check before any route starts paid AI work (DEV-208). Refuses
 * with `503 AI_GENERATION_PAUSED` once all users' spend today reaches the
 * global daily ceiling, then with `429 AI_BUDGET_EXHAUSTED` once this user's
 * spend this month reaches their tier ceiling. Fails closed when spend cannot
 * be read.
 */
export async function assertAiSpendAllowed(
  actor: { readonly id: string; readonly subscriptionTier: SubscriptionTier },
  dbClient: SpendReader,
  deps: AiSpendGuardDeps = {},
): Promise<void> {
  const now = deps.now?.() ?? new Date();
  const dayStart = startOfUtcDay(now);
  const monthStart = startOfUtcMonth(now);

  let globalSpent: number;
  let userSpent: number;
  try {
    [globalSpent, userSpent] = await Promise.all([
      sumAllAiSpendMicrousd(dayStart, deps.serviceDb ?? serviceRoleDb),
      sumUserAiSpendMicrousd(actor.id, monthStart, dbClient),
    ]);
  } catch (err) {
    // Fail closed, like the hourly limiter: unverified spend is not admitted.
    logger.error(
      { err, userId: actor.id, event: 'ai_spend_check_failed' },
      'AI spend check failed, failing closed',
    );
    throw new ServiceUnavailableError(
      'AI generation is temporarily unavailable. Please try again in a few minutes.',
    );
  }

  const globalCeiling = globalAiDailyCeilingMicrousd();
  reportGlobalSpend(
    globalSpent,
    globalCeiling,
    dayStart.toISOString().slice(0, 10),
  );
  if (globalSpent >= globalCeiling) {
    const resetsAt = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    throw new AppError(
      'AI generation is paused for today. Please try again tomorrow.',
      {
        status: 503,
        code: API_ERROR_CODES.AI_GENERATION_PAUSED,
        classification: 'capped',
        details: { resetsAt: resetsAt.toISOString() },
      },
    );
  }

  if (userSpent >= userAiCeilingMicrousd(actor.subscriptionTier)) {
    const resetsAt = startOfUtcMonth(now, 1);
    logger.info(
      {
        event: 'ai_user_budget_exhausted',
        userId: actor.id,
        tier: actor.subscriptionTier,
        spentMicrousd: userSpent,
      },
      'User reached the monthly AI budget',
    );
    throw new AppError(
      `You've reached this month's AI budget. It resets on ${formatUtcDate(resetsAt)}.`,
      {
        status: 429,
        code: API_ERROR_CODES.AI_BUDGET_EXHAUSTED,
        classification: 'capped',
        details: { resetsAt: resetsAt.toISOString() },
      },
    );
  }
}
