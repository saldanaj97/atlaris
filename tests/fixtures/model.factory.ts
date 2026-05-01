import type { AvailableModel } from '@/features/ai/types/model.types';

export function createTestModel(
  overrides: Partial<AvailableModel> = {},
): AvailableModel {
  const tier = overrides.tier ?? 'free';

  return {
    id: overrides.id ?? `test-${tier}-model`,
    name: overrides.name ?? `Test ${tier === 'free' ? 'Free' : 'Pro'} Model`,
    provider: overrides.provider ?? 'Test Provider',
    description:
      overrides.description ?? 'Deterministic test model for component specs.',
    tier,
    contextWindow: overrides.contextWindow ?? 128_000,
    maxOutputTokens: overrides.maxOutputTokens ?? 64_000,
    inputCostPerMillion:
      overrides.inputCostPerMillion ?? (tier === 'free' ? 0 : 1),
    outputCostPerMillion:
      overrides.outputCostPerMillion ?? (tier === 'free' ? 0 : 2),
  };
}
