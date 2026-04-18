import { buildModelPricingSnapshot } from '@/features/ai/model-pricing-snapshot';
import { microusdIntegerToBigint } from '@/features/ai/provider-cost-microusd';
import { getDb } from '@/lib/db/runtime';
import { aiUsageEvents } from '@/lib/db/schema';
import type { DbClient } from '@/lib/db/types';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';
import type { ModelPricingSnapshotV1 } from '@/shared/types/model-pricing-snapshot.types';

export type RecordUsageParams = {
  userId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  providerCostMicrousd?: bigint;
  modelPricingSnapshot?: ModelPricingSnapshotV1;
  requestId?: string;
};

/**
 * Maps canonical usage (single source of truth) to DB row fields for both
 * lifecycle and stream persistence paths.
 */
export function canonicalUsageToRecordParams(
  usage: CanonicalAIUsage,
  userId: string,
  requestId?: string | null
): RecordUsageParams {
  const snapshot = buildModelPricingSnapshot(usage);

  let providerMicrousd: bigint | null = null;
  // Partial usage means provider-reported cost provenance is incomplete, so we
  // persist the app-estimated `costCents` only and leave provider cost null.
  if (!usage.isPartial && usage.providerCostMicrousd != null) {
    providerMicrousd = microusdIntegerToBigint(usage.providerCostMicrousd);
  }

  return {
    userId,
    provider: usage.provider,
    model: usage.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costCents: usage.estimatedCostCents,
    providerCostMicrousd: providerMicrousd ?? undefined,
    modelPricingSnapshot: snapshot ?? undefined,
    requestId: requestId ?? undefined,
  };
}

export async function recordUsage(
  params: RecordUsageParams,
  dbClient: DbClient = getDb()
): Promise<void> {
  await dbClient.insert(aiUsageEvents).values({
    userId: params.userId,
    provider: params.provider,
    model: params.model,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    costCents: params.costCents,
    providerCostMicrousd: params.providerCostMicrousd ?? null,
    modelPricingSnapshot: params.modelPricingSnapshot ?? null,
    requestId: params.requestId ?? null,
  });
}
