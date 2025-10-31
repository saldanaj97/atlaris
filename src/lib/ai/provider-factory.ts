import type { AiPlanGenerationProvider } from './provider';
import { MockGenerationProvider } from './providers/mock';
import { RouterGenerationProvider } from './providers/router';

/**
 * Factory function to get the appropriate AI generation provider based on configuration.
 * Checks AI_PROVIDER environment variable to determine which provider to use.
 *
 * @returns The configured AI generation provider instance
 */
export function getGenerationProvider(): AiPlanGenerationProvider {
  const providerType = process.env.AI_PROVIDER?.toLowerCase();
  const isTest =
    process.env.NODE_ENV === 'test' || !!process.env.VITEST_WORKER_ID;

  // In test mode, honor AI_USE_MOCK strictly:
  // - AI_USE_MOCK === 'false' -> force real router
  // - otherwise -> default to mock for deterministic, offline tests
  if (isTest) {
    if (process.env.AI_USE_MOCK === 'false') {
      return new RouterGenerationProvider();
    }
    // Prefer mock in tests unless explicitly disabled
    const deterministicSeed = process.env.MOCK_GENERATION_SEED
      ? parseInt(process.env.MOCK_GENERATION_SEED, 10)
      : undefined;
    return new MockGenerationProvider({
      deterministicSeed:
        deterministicSeed !== undefined && !isNaN(deterministicSeed)
          ? deterministicSeed
          : undefined,
    });
  }

  if (
    providerType === 'mock' ||
    (!providerType && process.env.NODE_ENV === 'development')
  ) {
    // Use mock provider in development or when explicitly configured
    const deterministicSeed = process.env.MOCK_GENERATION_SEED
      ? parseInt(process.env.MOCK_GENERATION_SEED, 10)
      : undefined;
    return new MockGenerationProvider({
      deterministicSeed:
        deterministicSeed !== undefined && !isNaN(deterministicSeed)
          ? deterministicSeed
          : undefined,
    });
  }
  // Default to router for real usage with failover
  return new RouterGenerationProvider();
}
