import type { ModelOperation } from '@/features/ai/model-operation-policy';
import type { AiPlanGenerationProvider } from '@/features/ai/types/provider.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import { getFallbackModelsForTier } from '@/features/ai/ai-models';
import { MockGenerationProvider } from '@/features/ai/providers/mock';
import { RouterGenerationProvider } from '@/features/ai/providers/router';
import { aiEnv, appEnv } from '@/lib/config/env';
import { logger } from '@/lib/logging/logger';

function parseMockSeed(): number | undefined {
  return typeof aiEnv.mockSeed === 'number' && !Number.isNaN(aiEnv.mockSeed)
    ? aiEnv.mockSeed
    : undefined;
}

function shouldUseMock(): boolean {
  const provider = aiEnv.provider;
  if (provider === 'mock') return true;
  if (provider === 'router') return false;
  return appEnv.isTest || appEnv.isDevelopment;
}

export function getGenerationProviderWithModel(
  modelId: string,
  tier?: SubscriptionTier,
  operation?: ModelOperation,
): AiPlanGenerationProvider {
  if (!modelId) {
    throw new Error('modelId must be a non-empty string');
  }

  if (shouldUseMock()) {
    logger.debug(
      { source: 'provider-factory', requestedModel: modelId },
      'Mock provider active — requested modelId will not be used',
    );
    return new MockGenerationProvider({
      deterministicSeed: parseMockSeed(),
    });
  }

  return new RouterGenerationProvider({
    model: modelId,
    ...(tier !== undefined && operation !== undefined
      ? { fallbackModels: getFallbackModelsForTier(tier, modelId, operation) }
      : {}),
  });
}

export function getGenerationProvider(): AiPlanGenerationProvider {
  if (shouldUseMock()) {
    return new MockGenerationProvider({
      deterministicSeed: parseMockSeed(),
    });
  }

  return new RouterGenerationProvider({
    model: aiEnv.defaultModel,
  });
}
