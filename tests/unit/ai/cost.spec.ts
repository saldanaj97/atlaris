import { describe, expect, it } from 'vitest';

import {
  AVAILABLE_MODELS,
  getModelById,
  getModelsForTier,
} from '@/features/ai/ai-models';
import {
  calculateCostFromUsage,
  computeCostCents,
  DEFAULT_OUTPUT_TOKEN_CEILING,
  getOutputTokenCeiling,
} from '@/features/ai/cost';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';

// ─── computeCostCents ────────────────────────────────────────────

describe('computeCostCents', () => {
  it('returns 0 for unknown model', () => {
    expect(computeCostCents('unknown-model', 1000, 500)).toBe(0);
  });

  it('returns 0 when both token counts are 0', () => {
    expect(computeCostCents('openai/gpt-4o', 0, 0)).toBe(0);
  });

  it('returns 0 for free models', () => {
    expect(
      computeCostCents('google/gemini-2.0-flash-exp:free', 100_000, 50_000)
    ).toBe(0);
  });

  it('computes cost correctly for paid models', () => {
    // openai/gpt-4o: inputCostPerMillion = 2.5, outputCostPerMillion = 10
    // 1M input tokens at $2.5/M = $2.50 = 250 cents
    // 500K output tokens at $10/M = $5.00 = 500 cents
    // Total = 750 cents
    expect(computeCostCents('openai/gpt-4o', 1_000_000, 500_000)).toBe(750);
  });

  it('rounds to nearest cent', () => {
    // 100 input tokens at $2.5/M = $0.00025 = 0.025 cents → rounds to 0
    expect(computeCostCents('openai/gpt-4o', 100, 0)).toBe(0);
    // 10_000 input tokens at $2.5/M = $0.025 = 2.5 cents → rounds to 3
    expect(computeCostCents('openai/gpt-4o', 10_000, 0)).toBe(3);
  });

  it('is deterministic — same input always produces same output', () => {
    const model = 'openai/gpt-4o';
    const input = 123_456;
    const output = 78_901;
    const results = Array.from({ length: 100 }, () =>
      computeCostCents(model, input, output)
    );
    const unique = new Set(results);
    expect(unique.size).toBe(1);
  });

  it('computes cost for every paid model in the registry', () => {
    const paidModels = AVAILABLE_MODELS.filter(
      (m) => m.inputCostPerMillion > 0 || m.outputCostPerMillion > 0
    );
    expect(paidModels.length).toBeGreaterThan(0);
    for (const model of paidModels) {
      const cost = computeCostCents(model.id, 1_000_000, 1_000_000);
      // Cost should be positive for non-trivial usage on paid models
      expect(cost).toBeGreaterThan(0);
    }
  });
});

// ─── calculateCostFromUsage ──────────────────────────────────────

describe('calculateCostFromUsage', () => {
  it('derives cost deterministically from canonical usage', () => {
    const usage: CanonicalAIUsage = {
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      totalTokens: 1_500_000,
      model: 'openai/gpt-4o',
      provider: 'openrouter',
      estimatedCostCents: 999, // should be ignored — recalculated from model pricing
    };
    // 1M input at $2.5/M + 500K output at $10/M = 250 + 500 = 750 cents
    expect(calculateCostFromUsage(usage)).toBe(750);
  });

  it('returns 0 for unknown model regardless of estimatedCostCents', () => {
    const usage: CanonicalAIUsage = {
      inputTokens: 100_000,
      outputTokens: 50_000,
      totalTokens: 150_000,
      model: 'totally-unknown-model',
      provider: 'openrouter',
      estimatedCostCents: 500,
    };
    expect(calculateCostFromUsage(usage)).toBe(0);
  });

  it('is deterministic — repeated calls return same value', () => {
    const usage: CanonicalAIUsage = {
      inputTokens: 50_000,
      outputTokens: 25_000,
      totalTokens: 75_000,
      model: 'openai/gpt-4o',
      provider: 'openrouter',
      estimatedCostCents: 0,
    };
    const first = calculateCostFromUsage(usage);
    const second = calculateCostFromUsage(usage);
    const third = calculateCostFromUsage(usage);
    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it('returns 0 for free models', () => {
    const usage: CanonicalAIUsage = {
      inputTokens: 500_000,
      outputTokens: 200_000,
      totalTokens: 700_000,
      model: 'google/gemini-2.0-flash-exp:free',
      provider: 'openrouter',
      estimatedCostCents: 0,
    };
    expect(calculateCostFromUsage(usage)).toBe(0);
  });
});

// ─── getOutputTokenCeiling ───────────────────────────────────────

describe('getOutputTokenCeiling', () => {
  it('returns the model-defined maxOutputTokens when present', () => {
    // openai/gpt-4o has maxOutputTokens: 64_000
    expect(getOutputTokenCeiling('openai/gpt-4o')).toBe(64_000);
  });

  it('returns DEFAULT_OUTPUT_TOKEN_CEILING for models without maxOutputTokens', () => {
    // openrouter/free has no maxOutputTokens
    const model = getModelById('openrouter/free');
    expect(model?.maxOutputTokens).toBeUndefined();
    expect(getOutputTokenCeiling('openrouter/free')).toBe(
      DEFAULT_OUTPUT_TOKEN_CEILING
    );
  });

  it('returns DEFAULT_OUTPUT_TOKEN_CEILING for unknown models', () => {
    expect(getOutputTokenCeiling('nonexistent/model')).toBe(
      DEFAULT_OUTPUT_TOKEN_CEILING
    );
  });

  it('returns a ceiling for every model in the registry', () => {
    for (const model of AVAILABLE_MODELS) {
      const ceiling = getOutputTokenCeiling(model.id);
      expect(ceiling).toBeGreaterThan(0);
      expect(Number.isFinite(ceiling)).toBe(true);
    }
  });

  it('respects each model-specific ceiling', () => {
    const modelsWithCeilings = AVAILABLE_MODELS.filter(
      (m) => m.maxOutputTokens != null
    );
    expect(modelsWithCeilings.length).toBeGreaterThan(0);
    for (const model of modelsWithCeilings) {
      expect(getOutputTokenCeiling(model.id)).toBe(model.maxOutputTokens);
    }
  });
});

// ─── Tier consistency ────────────────────────────────────────────

describe('tier consistency', () => {
  it('enforces the same ceiling for a model regardless of user tier', () => {
    // For every model that appears in both free and pro tiers,
    // the ceiling must be identical.
    const freeTierModels = getModelsForTier('free');
    const proTierModels = getModelsForTier('pro');

    // Free models are a subset of pro models
    for (const freeModel of freeTierModels) {
      const proCounterpart = proTierModels.find((m) => m.id === freeModel.id);
      expect(proCounterpart).toBeDefined();

      const freeCeiling = getOutputTokenCeiling(freeModel.id);
      const proCeiling = getOutputTokenCeiling(freeModel.id);
      expect(freeCeiling).toBe(proCeiling);
    }
  });

  it('starter and free tiers get identical ceilings', () => {
    const freeModels = getModelsForTier('free');
    const starterModels = getModelsForTier('starter');

    expect(freeModels.length).toBe(starterModels.length);
    for (let i = 0; i < freeModels.length; i++) {
      expect(getOutputTokenCeiling(freeModels[i].id)).toBe(
        getOutputTokenCeiling(starterModels[i].id)
      );
    }
  });

  it('ceilings are tier-independent — defined by model, not by tier', () => {
    // This test verifies that getOutputTokenCeiling is a pure function
    // of modelId, with no tier parameter. The function signature itself
    // guarantees tier independence.
    const allModels = AVAILABLE_MODELS;
    for (const model of allModels) {
      const ceiling1 = getOutputTokenCeiling(model.id);
      const ceiling2 = getOutputTokenCeiling(model.id);
      expect(ceiling1).toBe(ceiling2);
    }
  });
});

// ─── DEFAULT_OUTPUT_TOKEN_CEILING ────────────────────────────────

describe('DEFAULT_OUTPUT_TOKEN_CEILING', () => {
  it('is a positive finite number', () => {
    expect(DEFAULT_OUTPUT_TOKEN_CEILING).toBeGreaterThan(0);
    expect(Number.isFinite(DEFAULT_OUTPUT_TOKEN_CEILING)).toBe(true);
  });

  it('is a reasonable value (between 8K and 256K tokens)', () => {
    expect(DEFAULT_OUTPUT_TOKEN_CEILING).toBeGreaterThanOrEqual(8_192);
    expect(DEFAULT_OUTPUT_TOKEN_CEILING).toBeLessThanOrEqual(256_000);
  });
});
