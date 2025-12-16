import pRetry from 'p-retry';

import type {
  AiPlanGenerationProvider,
  GenerationInput,
  GenerationOptions,
  ProviderGenerateResult,
} from '@/lib/ai/provider';
import { GoogleAiProvider } from '@/lib/ai/providers/google';
import { MockGenerationProvider } from '@/lib/ai/providers/mock';
import { OpenRouterProvider } from '@/lib/ai/providers/openrouter';
import { aiEnv, appEnv } from '@/lib/config/env';
import { logger } from '@/lib/logging/logger';

export interface RouterConfig {
  useMock?: boolean;
  enableOpenRouter?: boolean;
}

export class RouterGenerationProvider implements AiPlanGenerationProvider {
  private readonly providers: (() => AiPlanGenerationProvider)[];

  constructor(cfg: RouterConfig = {}) {
    const useMock =
      cfg.useMock ?? (aiEnv.useMock === 'true' && !appEnv.isProduction);

    const enableOpenRouter = cfg.enableOpenRouter ?? aiEnv.enableOpenRouter;

    if (useMock) {
      this.providers = [() => new MockGenerationProvider()];
      return;
    }

    const chain: (() => AiPlanGenerationProvider)[] = [];
    // Primary: OpenRouter (when enabled)
    if (enableOpenRouter) {
      chain.push(
        () =>
          new OpenRouterProvider({
            model: (
              aiEnv.deterministicOverflowModel ?? 'openai/gpt-oss-120b:free'
            ).replace(/^openrouter\//, ''),
          })
      );
    }
    // Fallback: Google
    chain.push(
      () =>
        new GoogleAiProvider({
          model: aiEnv.primaryModel ?? 'gemini-1.5-flash',
        })
    );

    this.providers = chain;
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
