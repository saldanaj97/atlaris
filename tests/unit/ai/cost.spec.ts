import {
  inMemoryModelCatalogStore,
  MODEL_CATALOG_FIXTURE,
} from '../../fixtures/ai-model-catalog';
import { getModelsForTier } from '@/features/ai/ai-models';
import {
  computeCostCents,
  DEFAULT_OUTPUT_TOKEN_CEILING,
  getOutputTokenCeiling,
  UnknownModelError,
} from '@/features/ai/cost';
import { selectCatalogModel } from '@/features/ai/model-catalog/store';
import { logger } from '@/lib/logging/logger';
import { afterEach, describe, expect, it, vi } from 'vitest';

const SYNCED_MODELS = Object.values(MODEL_CATALOG_FIXTURE).flat();
const GPT_6_SOL = 'openai/gpt-6-sol';

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── computeCostCents ────────────────────────────────────────────

describe('computeCostCents', () => {
  it('throws for unknown model', async () => {
    await expect(computeCostCents('unknown-model', 1000, 500)).rejects.toThrow(
      /Unknown model "unknown-model"/,
    );
  });

  it('returns 0 when both token counts are 0', async () => {
    expect(await computeCostCents('openai/gpt-6-sol', 0, 0)).toBe(0);
  });

  it('returns 0 for the free router', async () => {
    expect(await computeCostCents('openrouter/free', 100_000, 50_000)).toBe(0);
  });

  it('prices the Pro regeneration default from the synced catalog', async () => {
    // anthropic/claude-sonnet-5.5: $2/M input, $10/M output
    // 1M input = 200 cents, 500K output = 500 cents
    expect(
      await computeCostCents('anthropic/claude-sonnet-5.5', 1_000_000, 500_000),
    ).toBe(700);
  });

  it('reads the synced price, not a code constant', async () => {
    // deepseek/deepseek-v4.1-flash synced at $0.07/M in, $0.50/M out
    expect(
      await computeCostCents(
        'deepseek/deepseek-v4.1-flash',
        10_000_000,
        2_000_000,
      ),
    ).toBe(170);

    await inMemoryModelCatalogStore.replaceTierModels(
      'starter',
      MODEL_CATALOG_FIXTURE.starter.map((model) =>
        model.modelId === 'deepseek/deepseek-v4.1-flash'
          ? { ...model, inputCostPerMillion: 0.3, outputCostPerMillion: 1.2 }
          : model,
      ),
      new Date(),
    );

    expect(
      await computeCostCents(
        'deepseek/deepseek-v4.1-flash',
        10_000_000,
        2_000_000,
      ),
    ).toBe(540);
  });

  it('rounds to nearest cent', async () => {
    // 100 input tokens at $2/M = $0.0002 = 0.02 cents → rounds to 0
    expect(await computeCostCents('openai/gpt-6-sol', 100, 0)).toBe(0);
    // 12_500 input tokens at $2/M = $0.025 = 2.5 cents → rounds to 3
    expect(await computeCostCents('openai/gpt-6-sol', 12_500, 0)).toBe(3);
  });

  it('computes a positive cost for every paid synced model', async () => {
    const paidModels = SYNCED_MODELS.filter(
      (m) => m.inputCostPerMillion > 0 || m.outputCostPerMillion > 0,
    );
    expect(paidModels.length).toBeGreaterThan(0);
    for (const model of paidModels) {
      expect(
        await computeCostCents(model.modelId, 1_000_000, 1_000_000),
      ).toBeGreaterThan(0);
    }
  });

  it('treats an unreadable catalog as an unknown model and logs it', async () => {
    vi.mocked(selectCatalogModel).mockRejectedValueOnce(
      new Error('no database client'),
    );
    const errorSpy = vi.spyOn(logger, 'error');

    await expect(
      computeCostCents('openai/gpt-6-sol', 1000, 500),
    ).rejects.toBeInstanceOf(UnknownModelError);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'model_catalog_unavailable' }),
      expect.any(String),
    );
  });
});

// ─── getOutputTokenCeiling ───────────────────────────────────────

describe('getOutputTokenCeiling', () => {
  it('returns the synced maxOutputTokens when present', async () => {
    expect(await getOutputTokenCeiling(GPT_6_SOL)).toBe(128_000);
    expect(await getOutputTokenCeiling('deepseek/deepseek-v4.1-flash')).toBe(
      943_718,
    );
  });

  it('returns DEFAULT_OUTPUT_TOKEN_CEILING for the free router', async () => {
    expect(await getOutputTokenCeiling('openrouter/free')).toBe(
      DEFAULT_OUTPUT_TOKEN_CEILING,
    );
  });

  it('returns DEFAULT_OUTPUT_TOKEN_CEILING when the guardrail publishes no limit', async () => {
    await inMemoryModelCatalogStore.replaceTierModels(
      'pro',
      MODEL_CATALOG_FIXTURE.pro.map((model) =>
        model.modelId === 'openai/gpt-6-sol'
          ? { ...model, maxOutputTokens: null }
          : model,
      ),
      new Date(),
    );
    expect(await getOutputTokenCeiling(GPT_6_SOL)).toBe(
      DEFAULT_OUTPUT_TOKEN_CEILING,
    );
  });

  it('returns DEFAULT_OUTPUT_TOKEN_CEILING for unknown models', async () => {
    expect(await getOutputTokenCeiling('nonexistent/model')).toBe(
      DEFAULT_OUTPUT_TOKEN_CEILING,
    );
  });

  it('returns DEFAULT_OUTPUT_TOKEN_CEILING when the catalog cannot be read', async () => {
    vi.mocked(selectCatalogModel).mockRejectedValueOnce(
      new Error('no database client'),
    );
    vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    expect(await getOutputTokenCeiling(GPT_6_SOL)).toBe(
      DEFAULT_OUTPUT_TOKEN_CEILING,
    );
  });
});

// ─── Tier consistency ────────────────────────────────────────────

describe('tier consistency', () => {
  it('enforces the same ceiling for a model regardless of user tier', async () => {
    const starterModels = await getModelsForTier('starter', 'initial_outline');
    const proModels = await getModelsForTier('pro', 'initial_outline');
    const shared = starterModels.filter((model) =>
      proModels.some((pro) => pro.id === model.id),
    );
    expect(shared.length).toBeGreaterThan(0);

    for (const model of shared) {
      expect(await getOutputTokenCeiling(model.id)).toBe(model.maxOutputTokens);
    }
  });

  it('Free and Starter lesson lists share the free router; outline lists differ', async () => {
    const ids = async (...args: Parameters<typeof getModelsForTier>) =>
      (await getModelsForTier(...args)).map((m) => m.id);

    expect(await ids('free', 'lesson')).toEqual(await ids('starter', 'lesson'));
    expect(await ids('free', 'initial_outline')).not.toEqual(
      await ids('starter', 'initial_outline'),
    );
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
