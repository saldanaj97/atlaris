import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';
import type { ModelPricingSnapshotV1 } from '@/shared/types/model-pricing-snapshot.types';

import { getModelById } from '@/features/ai/ai-models';
import { isRuntimeOnlyModelId } from '@/features/ai/model-preferences';

/**
 * Builds a catalog-backed pricing snapshot for `ai_usage_events.model_pricing_snapshot`.
 * Returns null when provenance would be misleading (partial usage, unknown model, router).
 */
export function buildModelPricingSnapshot(
  usage: CanonicalAIUsage,
): ModelPricingSnapshotV1 | null {
  if (usage.isPartial) {
    return null;
  }
  if (
    !Number.isFinite(usage.inputTokens) ||
    !Number.isFinite(usage.outputTokens)
  ) {
    return null;
  }
  if (usage.inputTokens < 0 || usage.outputTokens < 0) {
    return null;
  }
  if (isRuntimeOnlyModelId(usage.model)) {
    return null;
  }

  const catalog = getModelById(usage.model);
  if (!catalog) {
    return null;
  }

  return {
    version: 1,
    source: 'local_catalog',
    requestedModelId: usage.model,
    pricedModelId: catalog.id,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    inputCostUsdPerMillion: catalog.inputCostPerMillion,
    outputCostUsdPerMillion: catalog.outputCostPerMillion,
  };
}
