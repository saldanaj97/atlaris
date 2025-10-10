import pRetry from 'p-retry';

import type {
  AiPlanGenerationProvider,
  GenerationInput,
  GenerationOptions,
  ProviderGenerateResult,
} from '@/lib/ai/provider';
import { CloudflareAiProvider } from '@/lib/ai/providers/cloudflare';
import { GoogleAiProvider } from '@/lib/ai/providers/google';
import { MockGenerationProvider } from '@/lib/ai/providers/mock';
import { OpenRouterProvider } from '@/lib/ai/providers/openrouter';

export interface RouterConfig {
  useMock?: boolean;
  enableOpenRouter?: boolean;
}

export class RouterGenerationProvider implements AiPlanGenerationProvider {
  private readonly providers: (() => AiPlanGenerationProvider)[];

  constructor(cfg: RouterConfig = {}) {
    const useMock =
      cfg.useMock ??
      (process.env.AI_USE_MOCK === 'true' &&
        process.env.NODE_ENV !== 'production');

    const enableOpenRouter =
      cfg.enableOpenRouter ?? process.env.AI_ENABLE_OPENROUTER === 'true';

    if (useMock) {
      this.providers = [() => new MockGenerationProvider()];
      return;
    }

    const chain: (() => AiPlanGenerationProvider)[] = [];
    // Primary: Google
    chain.push(
      () =>
        new GoogleAiProvider({
          model: process.env.AI_PRIMARY ?? 'gemini-1.5-flash',
        })
    );
    // Fallback: Cloudflare Workers AI
    chain.push(
      () =>
        new CloudflareAiProvider({
          model: process.env.AI_FALLBACK ?? '@cf/meta/llama-3.1-8b-instruct',
        })
    );
    // Overflow: OpenRouter if enabled
    if (enableOpenRouter) {
      chain.push(
        () =>
          new OpenRouterProvider({
            model: (
              process.env.AI_OVERFLOW ?? 'google/gemini-2.0-pro-exp'
            ).replace(/^openrouter\//, ''),
          })
      );
    }

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
      if (process.env.NODE_ENV !== 'production') {
        // Lightweight debug signal to help trace provider order and failures locally
        console.info(
          JSON.stringify({
            source: 'ai-router',
            level: 'info',
            event: 'provider_attempt',
            provider: providerName,
          })
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
        if (process.env.NODE_ENV !== 'production') {
          const message =
            err instanceof Error ? err.message : String(err ?? 'unknown error');
          console.warn(
            JSON.stringify({
              source: 'ai-router',
              level: 'warn',
              event: 'provider_failed',
              provider: providerName,
              message,
            })
          );
        }
        continue; // try next provider
      }
    }

    throw lastError ?? new Error('All AI providers failed');
  }
}
