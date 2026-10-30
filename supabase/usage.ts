import type { DbTransaction } from '@/lib/db/types';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';
import type { ModelPricingSnapshotV1 } from '@/shared/types/model-pricing-snapshot.types';

import { aiUsageEvents } from './schema';
import { buildModelPricingSnapshot } from '@/features/ai/model-pricing-snapshot';
import { microusdIntegerToBigint } from '@/features/ai/provider-cost-microusd';

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
  /** The plan the call generated content for, so per-plan spend can be summed. */
  planId?: string;
};

/**
 * Maps canonical usage (single source of truth) to DB row fields for both
 * lifecycle and stream persistence paths. Reads the model catalog, so call it
 * before opening the transaction that records the row.
 */
export async function canonicalUsageToRecordParams(
  usage: CanonicalAIUsage,
  userId: string,
  requestId?: string | null,
): Promise<RecordUsageParams> {
  const snapshot = await buildModelPricingSnapshot(usage);

  // A single partial call never has a provider cost (`normalizeToCanonicalUsage`).
  // A summed row can be partial and still carry its other calls' reported cost
  // (`sumUsages`); dropping it would record only the catalog estimate.
  const providerMicrousd =
    usage.providerCostMicrousd != null
      ? microusdIntegerToBigint(usage.providerCostMicrousd)
      : null;

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

export async function recordUsageInTx(
  tx: Pick<DbTransaction, 'insert'>,
  params: RecordUsageParams,
): Promise<void> {
  await tx.insert(aiUsageEvents).values({
    userId: params.userId,
    provider: params.provider,
    model: params.model,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    costCents: params.costCents,
    providerCostMicrousd: params.providerCostMicrousd ?? null,
    modelPricingSnapshot: params.modelPricingSnapshot ?? null,
    requestId: params.requestId ?? null,
    planId: params.planId ?? null,
  });
}
