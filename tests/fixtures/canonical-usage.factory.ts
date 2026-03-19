import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';

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
    ...overrides,
  };
}
