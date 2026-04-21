import { describe, expect, it } from 'vitest';

import { canonicalUsageToRecordParams } from '@/lib/db/usage';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';

function makeCanonicalUsage(
  overrides?: Partial<CanonicalAIUsage>
): CanonicalAIUsage {
  return {
    inputTokens: 100,
    outputTokens: 200,
    totalTokens: 300,
    model: 'openai/gpt-4o',
    provider: 'openrouter',
    estimatedCostCents: 5,
    providerCostMicrousd: 1_000,
    isPartial: false,
    missingFields: [],
    ...overrides,
  };
}

describe('canonicalUsageToRecordParams', () => {
  it('omits provider-only provenance fields for partial usage', () => {
    const params = canonicalUsageToRecordParams(
      makeCanonicalUsage({
        providerCostMicrousd: 1_000,
        isPartial: true,
        missingFields: ['provider'],
      }),
      'user-1'
    );

    expect(params.providerCostMicrousd).toBeUndefined();
    expect(params.modelPricingSnapshot).toBeUndefined();
  });
});
