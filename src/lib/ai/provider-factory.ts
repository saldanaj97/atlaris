import { MockGenerationProvider } from '@/lib/ai/providers/mock';
import { RouterGenerationProvider } from '@/lib/ai/providers/router';
import type { AiPlanGenerationProvider } from '@/lib/ai/types/provider.types';
import { aiEnv, appEnv } from '@/lib/config/env';

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
  // In test environment, still respect mock settings
  if (appEnv.isTest) {
    const providerType = aiEnv.provider;
    if (providerType === 'mock' || aiEnv.useMock !== 'false') {
      return new MockGenerationProvider({
        deterministicSeed:
          typeof aiEnv.mockSeed === 'number' ? aiEnv.mockSeed : undefined,
      });
    }
  }

  // Model/tier validation is enforced by resolveModelForTier before calling
  // this factory. This factory only constructs providers.
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
  const providerType = aiEnv.provider;
  const isTest = appEnv.isTest;

  // In tests, honor explicit AI_PROVIDER when set; otherwise default to mock unless disabled
  if (isTest) {
    // Parse seed once for reuse
    const deterministicSeed =
      typeof aiEnv.mockSeed === 'number' && !Number.isNaN(aiEnv.mockSeed)
        ? aiEnv.mockSeed
        : undefined;
    if (providerType === 'mock') {
      return new MockGenerationProvider({
        deterministicSeed,
      });
    }
    if (providerType && providerType !== 'mock') {
      // For any explicit non-mock provider in tests, route through the Router
      return new RouterGenerationProvider();
    }
    // Fallback in tests: prefer mock unless explicitly disabled
    if (aiEnv.useMock === 'false') {
      return new RouterGenerationProvider();
    }
    return new MockGenerationProvider({
      deterministicSeed,
    });
  }

  if (providerType === 'mock' || (!providerType && appEnv.isDevelopment)) {
    // Use mock provider in development or when explicitly configured
    const deterministicSeed =
      typeof aiEnv.mockSeed === 'number' && !Number.isNaN(aiEnv.mockSeed)
        ? aiEnv.mockSeed
        : undefined;
    return new MockGenerationProvider({
      deterministicSeed,
    });
  }
  // Default to router with default model for real usage
  return new RouterGenerationProvider({
    model: aiEnv.defaultModel,
  });
}
