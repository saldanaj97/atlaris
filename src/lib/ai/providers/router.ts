import pRetry from 'p-retry';

import { MockGenerationProvider } from '@/lib/ai/providers/mock';
import { OpenRouterProvider } from '@/lib/ai/providers/openrouter';
import type {
  AiPlanGenerationProvider,
  GenerationInput,
  GenerationOptions,
  ProviderGenerateResult,
} from '@/lib/ai/types/provider.types';
import { aiEnv, appEnv } from '@/lib/config/env';
import { logger } from '@/lib/logging/logger';

export interface RouterConfig {
  useMock?: boolean;
  model?: string;
}

export class RouterGenerationProvider implements AiPlanGenerationProvider {
  private readonly providers: (() => AiPlanGenerationProvider)[];

  constructor(cfg: RouterConfig = {}) {
    // Explicit config flag takes precedence over environment
    if (cfg.useMock === true) {
      this.providers = [() => new MockGenerationProvider()];
      return;
    }

    if (cfg.useMock === false) {
      const model = cfg.model ?? aiEnv.defaultModel;
      this.providers = [() => new OpenRouterProvider({ model })];
      return;
    }

    // Fall back to environment-based mock behavior (only in non-production)
    const useMock = aiEnv.useMock === 'true' && !appEnv.isProduction;

    if (useMock) {
      this.providers = [() => new MockGenerationProvider()];
      return;
    }

    // OpenRouter is now the only provider (Google AI deprecated)
    const model = cfg.model ?? aiEnv.defaultModel;
    this.providers = [() => new OpenRouterProvider({ model })];

    // TODO: Add Google AI as emergency fallback only if OpenRouter is completely down.
    // For now, we rely on OpenRouter's internal model routing and fallbacks.
  }

  async generate(
    input: GenerationInput,
    options?: GenerationOptions
  ): Promise<ProviderGenerateResult> {
    let lastError: unknown;

    for (const factory of this.providers) {
      const provider = factory();
      const providerName = provider.constructor?.name ?? 'unknown-provider';
      if (!appEnv.isProduction) {
        // Lightweight debug signal to help trace provider order and failures locally
        logger.debug(
          {
            source: 'ai-router',
            event: 'provider_attempt',
            provider: providerName,
          },
          'AI router attempting provider'
        );
      }
      try {
        // Light retry on transient failures
        const result = await pRetry(() => provider.generate(input, options), {
          retries: 1,
          minTimeout: 300,
          maxTimeout: 700,
          randomize: true,
        });
        return result;
      } catch (err) {
        lastError = err;
        const message = err instanceof Error ? err.message : 'unknown error';
        // Always log provider failures in production for visibility
        logger.warn(
          {
            source: 'ai-router',
            event: 'provider_failed',
            provider: providerName,
            message,
            ...(err instanceof Error && !appEnv.isProduction
              ? { stack: err.stack }
              : {}),
          },
          'AI router provider failed'
        );
        continue; // try next provider
      }
    }

    // Ensure we throw an Error object
    if (lastError instanceof Error) {
      throw lastError;
    }
    throw new Error('All AI providers failed');
  }
}
