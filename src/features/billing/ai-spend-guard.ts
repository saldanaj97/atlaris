import type { DbClient } from '@/lib/db/types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import {
  type AiBudgetTier,
  TIER_AI_DAILY_BUDGET,
  tierAiDailyCeilingMicrousd,
  trialDailyCeilingMicrousd,
  trialUserAiCeilingMicrousd,
  userAiCeilingMicrousd,
} from '@/features/billing/plan-ai-budget';
import { AppError, ServiceUnavailableError } from '@/lib/api/errors';
import {
  sumTierAiSpendMicrousd,
  sumTrialAiSpendMicrousd,
  sumUserAiSpendMicrousd,
} from '@/lib/db/queries/plan-ai-budget';
import { logger } from '@/lib/logging/logger';
import { API_ERROR_CODES } from '@/shared/constants/api-error-codes';
import { isTrialing } from '@/shared/constants/tier-limits';
import * as Sentry from '@sentry/nextjs';
import { db as serviceRoleDb } from '@supabase/service-role';

type SpendReader = Pick<DbClient, 'select'>;

export type AiSpendGuardDeps = {
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

const UTC_DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatUtcDate(date: Date): string {
  return UTC_DATE_FORMAT.format(date);
}

type AiPool = AiBudgetTier | 'trial';

const TIER_LABEL: Record<AiPool, string> = {
  trial: 'Trial',
  starter: 'Starter',
  pro: 'Pro',
};

function reportTierSpend(
  tier: AiPool,
  spent: number,
  ceiling: number,
  day: string,
): void {
  const tripped = spent >= ceiling;
  const share = [...TIER_AI_DAILY_BUDGET.alertShares]
    .sort((a, b) => b - a)
    .find((candidate) => spent >= ceiling * candidate);
  if (!tripped && share === undefined) return;

  const percent = tripped ? 100 : Math.round(share! * 100);
  const label = TIER_LABEL[tier];
  const fields = {
    event: 'ai_tier_daily_spend',
    tier,
    percent,
    spentMicrousd: spent,
    ceilingMicrousd: ceiling,
    day,
  };
  if (tripped) {
    logger.error(fields, 'Tier daily AI spend ceiling reached; AI paused');
  } else {
    logger.warn(fields, 'Tier daily AI spend passed an alert threshold');
  }
  Sentry.captureMessage(
    tripped
      ? `${label} daily AI spend ceiling reached; new ${label} AI work is paused`
      : `${label} daily AI spend passed ${percent}% of the ceiling`,
    {
      level: tripped ? 'fatal' : percent >= 80 ? 'error' : 'warning',
      fingerprint: ['ai_tier_daily_spend', tier, String(percent), day],
      tags: { event: 'ai_tier_daily_spend', tier, percent: String(percent) },
      extra: { spentMicrousd: spent, ceilingMicrousd: ceiling },
    },
  );
}

export async function assertAiSpendAllowed(
  actor: {
    readonly id: string;
    readonly subscriptionTier: SubscriptionTier;
    readonly subscriptionStatus?: string | null;
  },
  dbClient: SpendReader,
  deps: AiSpendGuardDeps = {},
): Promise<void> {
  const now = deps.now?.() ?? new Date();
  const dayStart = startOfUtcDay(now);
  const monthStart = startOfUtcMonth(now);

  const tier = actor.subscriptionTier;
  if (tier === 'free') return;
  const trial = isTrialing(actor);
  const pool: AiPool = trial ? 'trial' : tier;

  let tierSpent: number;
  let userSpent: number;
  try {
    [tierSpent, userSpent] = await Promise.all([
      trial
        ? sumTrialAiSpendMicrousd(dayStart, deps.serviceDb ?? serviceRoleDb)
        : sumTierAiSpendMicrousd(
            tier,
            dayStart,
            deps.serviceDb ?? serviceRoleDb,
          ),
      sumUserAiSpendMicrousd(actor.id, monthStart, dbClient),
    ]);
  } catch (err) {
    logger.error(
      { err, userId: actor.id, event: 'ai_spend_check_failed' },
      'AI spend check failed, failing closed',
    );
    throw new ServiceUnavailableError(
      'AI generation is temporarily unavailable. Please try again in a few minutes.',
    );
  }

  const tierCeiling = trial
    ? trialDailyCeilingMicrousd()
    : tierAiDailyCeilingMicrousd(tier);
  reportTierSpend(
    pool,
    tierSpent,
    tierCeiling,
    dayStart.toISOString().slice(0, 10),
  );
  if (tierSpent >= tierCeiling) {
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

  if (
    userSpent >=
    (trial ? trialUserAiCeilingMicrousd() : userAiCeilingMicrousd(tier))
  ) {
    const resetsAt = startOfUtcMonth(now, 1);
    logger.info(
      {
        event: 'ai_user_budget_exhausted',
        userId: actor.id,
        tier,
        trial,
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
