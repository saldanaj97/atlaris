import type { ProviderMetadata } from '@/shared/types/ai-provider.types';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';

/** Catalog model id that resolves via `getModelById` for snapshot assertions. */
export const CATALOG_MODEL_OPENAI_GPT4O = 'openai/gpt-4o' as const;

export function makeCanonicalUsage(
  overrides?: Partial<CanonicalAIUsage>
): CanonicalAIUsage {
  return {
    inputTokens: 100,
    outputTokens: 200,
    totalTokens: 300,
    model: 'gpt-4o',
    provider: 'openai',
    estimatedCostCents: 0,
    providerCostMicrousd: null,
    isPartial: false,
    missingFields: [],
    ...overrides,
  };
}

/**
 * Provider metadata that normalizes to a catalog-backed `openai/gpt-4o` row with
 * provider USD cost (for entry-point tests that exercise snapshot + microusd).
 */
export function makeOpenRouterGpt4oProviderMetadata(
  overrides?: Partial<ProviderMetadata>
): ProviderMetadata {
  const { usage: usageOverrides, ...restOverrides } = overrides ?? {};

  return {
    provider: 'openrouter',
    model: CATALOG_MODEL_OPENAI_GPT4O,
    usage: {
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
      providerReportedCostUsd: 0.001,
      ...usageOverrides,
    },
    ...restOverrides,
  };
}
