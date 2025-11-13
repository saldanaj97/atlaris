import { aiEnv, appEnv } from '@/lib/config/env';
import type { AiPlanGenerationProvider } from './provider';
import { MockGenerationProvider } from './providers/mock';
import { RouterGenerationProvider } from './providers/router';

/**
 * Selects and returns an AI generation provider implementation based on environment configuration.
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
  // Default to router for real usage with failover
  return new RouterGenerationProvider();
}
