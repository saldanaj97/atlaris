import { MockGenerationProvider } from '@/lib/ai/providers/mock';
import { RouterGenerationProvider } from '@/lib/ai/providers/router';
import { aiEnv, appEnv } from '@/lib/config/env';
import { logger } from '@/lib/logging/logger';

import type { AiPlanGenerationProvider } from '@/lib/ai/types/provider.types';

function parseMockSeed(): number | undefined {
  return typeof aiEnv.mockSeed === 'number' && !Number.isNaN(aiEnv.mockSeed)
    ? aiEnv.mockSeed
    : undefined;
}

/** Returns true when mock providers should be used (test/dev default, explicit opt-in). */
function shouldUseMock(): boolean {
  const provider = aiEnv.provider;
  if (provider === 'mock') return true;
  // Explicit non-mock provider always overrides mock defaults
  if (provider) return false;
  // No explicit provider — fall back to environment defaults
  if (appEnv.isTest) return aiEnv.useMock !== 'false';
  if (appEnv.isDevelopment) return true;
  return false;
}

/**
 * Creates a generation provider configured with a specific model.
 * Used when a user has selected a preferred model or when explicitly specifying a model.
 *
 * @param modelId - OpenRouter model ID (e.g., 'google/gemini-2.0-flash-exp:free')
 * @returns An instance implementing `AiPlanGenerationProvider`
 */
export function getGenerationProviderWithModel(
  modelId: string
): AiPlanGenerationProvider {
  if (!modelId) {
    throw new Error('modelId must be a non-empty string');
  }

  if (shouldUseMock()) {
    logger.debug(
      { source: 'provider-factory', requestedModel: modelId },
      'Mock provider active — requested modelId will not be used'
    );
    return new MockGenerationProvider({
      deterministicSeed: parseMockSeed(),
    });
  }

  return new RouterGenerationProvider({ model: modelId });
}

/**
 * Selects and returns an AI generation provider implementation based on environment configuration.
 * Uses the default model when no specific model is requested.
 *
 * Prioritizes an explicit `AI_PROVIDER`, prefers mock providers in development and most test scenarios
 * (unless `AI_USE_MOCK` is explicitly `"false"`), and defaults to a router-based provider for production.
 * If `MOCK_GENERATION_SEED` contains a valid integer, that value is passed as `deterministicSeed` to the mock provider.
 *
 * @returns An instance implementing `AiPlanGenerationProvider` — either a `MockGenerationProvider` (possibly configured with a deterministic seed) or a `RouterGenerationProvider`
 */
export function getGenerationProvider(): AiPlanGenerationProvider {
  if (shouldUseMock()) {
    return new MockGenerationProvider({
      deterministicSeed: parseMockSeed(),
    });
  }

  // Explicit non-mock provider or production — always pass model explicitly
  return new RouterGenerationProvider({
    model: aiEnv.defaultModel,
  });
}
