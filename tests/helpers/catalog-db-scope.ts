import { inMemoryModelCatalogStore } from '../fixtures/ai-model-catalog';
import { getCatalogModel } from '@/features/ai/model-catalog/catalog';
import { selectCatalogModel } from '@/features/ai/model-catalog/store';
import { safeNormalizeUsage } from '@/features/ai/usage';
import { expect, onTestFinished, vi } from 'vitest';

/** Starter and Pro list it at $2/M input, 128K max output. */
const PROBE_MODEL_ID = 'openai/gpt-6.1-sol';

/**
 * Makes catalog reads fail outside `scoped`, the way a jobs Worker step's
 * service-role `db` does without a pool from `withStepDb`. Wrap the test's
 * `withDb` in `scoped`. Lasts until the current test finishes.
 */
export function catalogReadsRequireDb() {
  let depth = 0;
  onTestFinished(() => {
    vi.mocked(selectCatalogModel).mockImplementation(
      inMemoryModelCatalogStore.selectCatalogModel,
    );
  });
  vi.mocked(selectCatalogModel).mockImplementation(async (modelId) => {
    if (depth === 0) {
      throw new Error('No database client outside withDb');
    }
    return inMemoryModelCatalogStore.selectCatalogModel(modelId);
  });

  return {
    async scoped<T>(fn: () => Promise<T>): Promise<T> {
      depth += 1;
      try {
        return await fn();
      } finally {
        depth -= 1;
      }
    },
  };
}

/** What a model call's step sees in the catalog: entry and 1M-input cost. */
export async function probeCatalog() {
  const usage = await safeNormalizeUsage({
    provider: 'openrouter',
    model: PROBE_MODEL_ID,
    usage: { promptTokens: 1_000_000, completionTokens: 0 },
  });
  return {
    entry: await getCatalogModel(PROBE_MODEL_ID).catch(() => null),
    estimatedCostCents: usage.estimatedCostCents,
  };
}

/** The probe result inside a `withDb` scope: $2/M × 1M input = 200 cents. */
export const PRICED_PROBE = {
  entry: expect.objectContaining({ id: PROBE_MODEL_ID }),
  estimatedCostCents: 200,
};
