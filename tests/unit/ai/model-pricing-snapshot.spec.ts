import { describe, expect, it } from 'vitest';

import {
  buildModelPricingSnapshot,
  parseModelPricingSnapshot,
} from '@/features/ai/model-pricing-snapshot';
import { AI_DEFAULT_MODEL } from '@/shared/constants/ai-models';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';

function baseComplete(overrides?: Partial<CanonicalAIUsage>): CanonicalAIUsage {
  return {
    inputTokens: 100,
    outputTokens: 200,
    totalTokens: 300,
    model: 'openai/gpt-4o',
    provider: 'openrouter',
    estimatedCostCents: 50,
    providerCostMicrousd: null,
    isPartial: false,
    missingFields: [],
    ...overrides,
  };
}

describe('buildModelPricingSnapshot', () => {
  it('returns a v1 snapshot for a catalog-backed non-router model', () => {
    const snap = buildModelPricingSnapshot(baseComplete());
    expect(snap).not.toBeNull();
    expect(snap?.version).toBe(1);
    expect(snap?.source).toBe('local_catalog');
    expect(snap?.requestedModelId).toBe('openai/gpt-4o');
    expect(snap?.pricedModelId).toBe('openai/gpt-4o');
    expect(snap?.inputTokens).toBe(100);
    expect(snap?.outputTokens).toBe(200);
    expect(Number.isFinite(snap?.inputCostUsdPerMillion)).toBe(true);
    expect(Number.isFinite(snap?.outputCostUsdPerMillion)).toBe(true);
    expect(snap?.inputCostUsdPerMillion).toBeGreaterThan(0);
    expect(snap?.outputCostUsdPerMillion).toBeGreaterThan(0);
  });

  it('returns null for partial usage', () => {
    expect(
      buildModelPricingSnapshot(
        baseComplete({
          isPartial: true,
          missingFields: ['model'],
        }),
      ),
    ).toBeNull();
  });

  it('returns null for runtime router model', () => {
    expect(
      buildModelPricingSnapshot(
        baseComplete({
          model: AI_DEFAULT_MODEL,
        }),
      ),
    ).toBeNull();
  });

  it('returns null for unknown model ids', () => {
    expect(
      buildModelPricingSnapshot(
        baseComplete({
          model: 'unknown/unknown-model-xyz',
        }),
      ),
    ).toBeNull();
  });

  it('parses a valid stored snapshot', () => {
    const parsed = parseModelPricingSnapshot({
      version: 1,
      source: 'local_catalog',
      requestedModelId: 'openai/gpt-4o',
      pricedModelId: 'openai/gpt-4o',
      inputTokens: 100,
      outputTokens: 200,
      inputCostUsdPerMillion: 2.5,
      outputCostUsdPerMillion: 10,
    });

    expect(parsed).toMatchObject({
      version: 1,
      source: 'local_catalog',
      requestedModelId: 'openai/gpt-4o',
    });
  });

  it('rejects malformed stored snapshots', () => {
    expect(
      parseModelPricingSnapshot({
        version: 1,
        source: 'local_catalog',
        requestedModelId: 'openai/gpt-4o',
        pricedModelId: 'openai/gpt-4o',
        inputTokens: -1,
        outputTokens: 200,
        inputCostUsdPerMillion: 2.5,
        outputCostUsdPerMillion: 10,
      }),
    ).toBeNull();

    expect(
      parseModelPricingSnapshot({
        version: 1,
        source: 'local_catalog',
        requestedModelId: 'openai/gpt-4o',
        pricedModelId: 'openai/gpt-4o',
        inputTokens: 100,
        outputTokens: 200,
        inputCostUsdPerMillion: 2.5,
        outputCostUsdPerMillion: 10,
        extra: true,
      }),
    ).toBeNull();
  });
});
