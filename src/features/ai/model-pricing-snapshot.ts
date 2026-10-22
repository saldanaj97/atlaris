import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';
import type { ModelPricingSnapshotV1 } from '@/shared/types/model-pricing-snapshot.types';

import { getCatalogModel } from '@/features/ai/model-catalog/catalog';
import { isRuntimeOnlyModelId } from '@/features/ai/model-preferences';
import { logger } from '@/lib/logging/logger';

/**
 * Builds a catalog-backed pricing snapshot for `ai_usage_events.model_pricing_snapshot`
 * from the synced guardrail pricing at record time. Stored rows keep their
 * snapshot when the catalog changes later.
 * Returns null when provenance would be misleading (partial usage, unknown model, router).
 */
export async function buildModelPricingSnapshot(
  usage: CanonicalAIUsage,
): Promise<ModelPricingSnapshotV1 | null> {
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

  let catalog;
  try {
    catalog = await getCatalogModel(usage.model);
  } catch (error) {
    // The usage row still records; only its pricing provenance is missing.
    logger.error(
      { modelId: usage.model, err: error, event: 'model_catalog_unavailable' },
      'Model catalog read failed; recording usage without a pricing snapshot',
    );
    return null;
  }
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
