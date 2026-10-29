import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';

import { canonicalUsageToRecordParams } from '../../../supabase/usage';
import { describe, expect, it } from 'vitest';

function makeCanonicalUsage(
  overrides?: Partial<CanonicalAIUsage>,
): CanonicalAIUsage {
  return {
    inputTokens: 100,
    outputTokens: 200,
    totalTokens: 300,
    model: 'openai/gpt-6-sol',
    provider: 'openrouter',
    estimatedCostCents: 5,
    providerCostMicrousd: 1_000,
    isPartial: false,
    missingFields: [],
    ...overrides,
  };
}

describe('canonicalUsageToRecordParams', async () => {
  it('omits the pricing snapshot for partial usage', async () => {
    const params = await canonicalUsageToRecordParams(
      makeCanonicalUsage({
        providerCostMicrousd: null,
        isPartial: true,
        missingFields: ['provider'],
      }),
      'user-1',
    );

    expect(params.providerCostMicrousd).toBeUndefined();
    expect(params.modelPricingSnapshot).toBeUndefined();
  });

  it('keeps the reported cost of a summed row that has a partial call (DEV-185)', async () => {
    // `sumUsages` of a call with usage and one whose usage never arrived.
    const params = await canonicalUsageToRecordParams(
      makeCanonicalUsage({
        providerCostMicrousd: 1_000,
        isPartial: true,
        missingFields: ['inputTokens', 'outputTokens'],
      }),
      'user-1',
    );

    expect(params.providerCostMicrousd).toBe(BigInt(1_000));
  });
});
