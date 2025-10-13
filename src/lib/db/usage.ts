import { db } from '@/lib/db/drizzle';
import { aiUsageEvents } from '@/lib/db/schema';
import { incrementUsage } from '@/lib/stripe/usage';

export interface EnsureBudgetParams {
  type: 'plan' | 'regeneration';
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
