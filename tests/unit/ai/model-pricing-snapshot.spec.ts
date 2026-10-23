import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';

import {
  inMemoryModelCatalogStore,
  MODEL_CATALOG_FIXTURE,
} from '../../fixtures/ai-model-catalog';
import { buildModelPricingSnapshot } from '@/features/ai/model-pricing-snapshot';
import { AI_DEFAULT_MODEL } from '@/shared/constants/ai-models';
import { describe, expect, it } from 'vitest';

function baseComplete(overrides?: Partial<CanonicalAIUsage>): CanonicalAIUsage {
  return {
    inputTokens: 100,
    outputTokens: 200,
    totalTokens: 300,
    model: 'openai/gpt-6-sol',
    provider: 'openrouter',
    estimatedCostCents: 50,
    providerCostMicrousd: null,
    isPartial: false,
    missingFields: [],
    ...overrides,
  };
}

describe('buildModelPricingSnapshot', async () => {
  it('returns a v1 snapshot for a catalog-backed non-router model', async () => {
    const snap = await buildModelPricingSnapshot(baseComplete());
    expect(snap).not.toBeNull();
    expect(snap?.version).toBe(1);
    expect(snap?.source).toBe('local_catalog');
    expect(snap?.requestedModelId).toBe('openai/gpt-6-sol');
    expect(snap?.pricedModelId).toBe('openai/gpt-6-sol');
    expect(snap?.inputTokens).toBe(100);
    expect(snap?.outputTokens).toBe(200);
    expect(Number.isFinite(snap?.inputCostUsdPerMillion)).toBe(true);
    expect(Number.isFinite(snap?.outputCostUsdPerMillion)).toBe(true);
    expect(snap?.inputCostUsdPerMillion).toBeGreaterThan(0);
    expect(snap?.outputCostUsdPerMillion).toBeGreaterThan(0);
  });

  it('snapshots the synced price at the time of the call', async () => {
    await inMemoryModelCatalogStore.replaceTierModels(
      'pro',
      MODEL_CATALOG_FIXTURE.pro.map((model) =>
        model.modelId === 'openai/gpt-6-sol'
          ? { ...model, inputCostPerMillion: 3, outputCostPerMillion: 15 }
          : model,
      ),
      new Date(),
    );

    expect(await buildModelPricingSnapshot(baseComplete())).toMatchObject({
      pricedModelId: 'openai/gpt-6-sol',
      inputCostUsdPerMillion: 3,
      outputCostUsdPerMillion: 15,
    });
  });

  it('returns null for partial usage', async () => {
    expect(
      await buildModelPricingSnapshot(
        baseComplete({
          isPartial: true,
          missingFields: ['model'],
        }),
      ),
    ).toBeNull();
  });

  it('returns null for runtime router model', async () => {
    expect(
      await buildModelPricingSnapshot(
        baseComplete({
          model: AI_DEFAULT_MODEL,
        }),
      ),
    ).toBeNull();
  });

  it('returns null for unknown model ids', async () => {
    expect(
      await buildModelPricingSnapshot(
        baseComplete({
          model: 'unknown/unknown-model-xyz',
        }),
      ),
    ).toBeNull();
  });
});
