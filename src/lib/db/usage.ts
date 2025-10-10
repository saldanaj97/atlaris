import { db } from '@/lib/db/drizzle';
import { aiUsageEvents } from '@/lib/db/schema';
import {
  incrementUsage,
  checkPlanLimit,
  checkRegenerationLimit,
} from '@/lib/stripe/usage';

export interface EnsureBudgetParams {
  type: 'plan' | 'regeneration';
}

/**
 * @deprecated For plan limits, use atomicCheckAndInsertPlan from @/lib/stripe/usage instead
 * to prevent race conditions. This function is kept for backward compatibility and regeneration checks.
 */
export async function ensureWithinBudget(
  userId: string,
  params: EnsureBudgetParams
) {
  if (params.type === 'plan') {
    const ok = await checkPlanLimit(userId);
    if (!ok) {
      throw new Error('Plan limit reached for current subscription tier.');
    }
  } else if (params.type === 'regeneration') {
    const ok = await checkRegenerationLimit(userId);
    if (!ok) {
      throw new Error('Monthly regeneration limit reached.');
    }
  }
}

export interface RecordUsageParams {
  userId: string;
  provider: string;
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costCents?: number | null;
  requestId?: string | null;
  kind?: 'plan' | 'regeneration';
}

export async function recordUsage(params: RecordUsageParams) {
  await db.insert(aiUsageEvents).values({
    userId: params.userId,
    provider: params.provider,
    model: params.model,
    inputTokens: params.inputTokens ?? 0,
    outputTokens: params.outputTokens ?? 0,
    costCents: params.costCents ?? 0,
    requestId: params.requestId ?? null,
  });

  if (params.kind) {
    // Update monthly aggregate counters
    await incrementUsage(params.userId, params.kind);
  }
}
