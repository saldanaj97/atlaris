import {
  AVAILABLE_MODELS,
  getModelById,
  getModelsForTier,
} from '@/features/ai/ai-models';
import {
  computeCostCents,
  DEFAULT_OUTPUT_TOKEN_CEILING,
  getOutputTokenCeiling,
} from '@/features/ai/cost';
import { describe, expect, it } from 'vitest';

// ─── computeCostCents ────────────────────────────────────────────

describe('computeCostCents', () => {
  it('throws for unknown model', () => {
    expect(() => computeCostCents('unknown-model', 1000, 500)).toThrow(
      /Unknown model "unknown-model"/,
    );
  });

  it('returns 0 when both token counts are 0', () => {
    expect(computeCostCents('openai/gpt-6-sol', 0, 0)).toBe(0);
  });

  it('returns 0 for free models', () => {
    expect(computeCostCents('openrouter/free', 100_000, 50_000)).toBe(0);
  });

  it('prices the Pro regeneration default from the catalog', () => {
    // anthropic/claude-sonnet-5.5: $2/M input, $10/M output
    // 1M input = 200 cents, 500K output = 500 cents
    expect(
      computeCostCents('anthropic/claude-sonnet-5.5', 1_000_000, 500_000),
    ).toBe(700);
  });

  it('computes cost correctly for paid models', () => {
    // anthropic/claude-opus-5.5: inputCostPerMillion = 4, outputCostPerMillion = 20
    // 1M input tokens at $4/M = $4.00 = 400 cents
    // 500K output tokens at $20/M = $10.00 = 1000 cents
    // Total = 1400 cents
    expect(
      computeCostCents('anthropic/claude-opus-5.5', 1_000_000, 500_000),
    ).toBe(1400);
  });

  it('rounds to nearest cent', () => {
    // 100 input tokens at $2/M = $0.0002 = 0.02 cents → rounds to 0
    expect(computeCostCents('openai/gpt-6-sol', 100, 0)).toBe(0);
    // 12_500 input tokens at $2/M = $0.025 = 2.5 cents → rounds to 3
    expect(computeCostCents('openai/gpt-6-sol', 12_500, 0)).toBe(3);
  });

  it('is deterministic — same input always produces same output', () => {
    const model = 'openai/gpt-6-sol';
    const input = 123_456;
    const output = 78_901;
    const results = Array.from({ length: 100 }, () =>
      computeCostCents(model, input, output),
    );
    const unique = new Set(results);
    expect(unique.size).toBe(1);
  });

  it('computes cost for every paid model in the registry', () => {
    const paidModels = AVAILABLE_MODELS.filter(
      (m) => m.inputCostPerMillion > 0 || m.outputCostPerMillion > 0,
    );
    expect(paidModels.length).toBeGreaterThan(0);
    for (const model of paidModels) {
      const cost = computeCostCents(model.id, 1_000_000, 1_000_000);
      // Cost should be positive for non-trivial usage on paid models
      expect(cost).toBeGreaterThan(0);
    }
  });
});

// ─── getOutputTokenCeiling ───────────────────────────────────────

describe('getOutputTokenCeiling', () => {
  it('returns the model-defined maxOutputTokens when present', () => {
    const model = getModelById('openai/gpt-6-sol');
    expect(model?.maxOutputTokens).toBe(128_000);
    expect(getOutputTokenCeiling(model?.id ?? '')).toBe(128_000);
  });

  it('returns DEFAULT_OUTPUT_TOKEN_CEILING for models without maxOutputTokens', () => {
    // openrouter/free has no maxOutputTokens
    const model = getModelById('openrouter/free');
    expect(model?.maxOutputTokens).toBeUndefined();
    expect(getOutputTokenCeiling('openrouter/free')).toBe(
      DEFAULT_OUTPUT_TOKEN_CEILING,
    );
  });

  it('returns DEFAULT_OUTPUT_TOKEN_CEILING for unknown models', () => {
    expect(getOutputTokenCeiling('nonexistent/model')).toBe(
      DEFAULT_OUTPUT_TOKEN_CEILING,
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
      (m) => m.maxOutputTokens != null,
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
    const freeOutlineModels = getModelsForTier('free', 'initial_outline');
    const proOutlineModels = getModelsForTier('pro', 'initial_outline');

    for (const freeModel of freeOutlineModels) {
      const proCounterpart = proOutlineModels.find(
        (m) => m.id === freeModel.id,
      );
      if (!proCounterpart) {
        throw new Error(
          `Free-tier model "${freeModel.id}" has no pro-tier counterpart`,
        );
      }

      const freeCeiling = getOutputTokenCeiling(freeModel.id);
      const proCeiling = getOutputTokenCeiling(proCounterpart.id);
      expect(freeCeiling).toBe(proCeiling);
    }
  });

  it('Free and Starter lesson catalogs share the free router; outline catalogs differ', () => {
    expect(getModelsForTier('free', 'lesson').map((m) => m.id)).toEqual(
      getModelsForTier('starter', 'lesson').map((m) => m.id),
    );
    expect(
      getModelsForTier('free', 'initial_outline').map((m) => m.id),
    ).not.toEqual(
      getModelsForTier('starter', 'initial_outline').map((m) => m.id),
    );
  });

  it('getOutputTokenCeiling is a pure function of modelId (no tier parameter)', () => {
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
