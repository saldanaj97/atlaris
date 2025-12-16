/**
 * Google AI Provider (DEPRECATED)
 *
 * @deprecated This provider is deprecated as of the OpenRouter migration.
 * OpenRouter is now the primary and only provider for AI plan generation.
 *
 * This file is retained for emergency rollback purposes only and will be
 * removed after a 30-day transition period. Do not use this provider for
 * new implementations.
 *
 * Migration date: December 16, 2025
 * Planned removal: January 15, 2026
 *
 * For new implementations, use:
 * - getGenerationProvider() from @/lib/ai/provider-factory
 * - getGenerationProviderWithModel(modelId) for specific models
 *
 * @see src/lib/ai/provider-factory.ts
 * @see src/lib/ai/models.ts
 */

import type {
  AiPlanGenerationProvider,
  GenerationInput,
  GenerationOptions,
  ProviderGenerateResult,
} from '@/lib/ai/provider';
import {
  buildPlanProviderResult,
  generatePlanObject,
} from '@/lib/ai/providers/base';
import { googleAiEnv } from '@/lib/config/env';
import { createGoogleGenerativeAI, google } from '@ai-sdk/google';

export interface GoogleProviderConfig {
  apiKey?: string;
  model?: string; // e.g., 'gemini-1.5-flash'
  maxOutputTokens?: number;
  temperature?: number;
}

export class GoogleAiProvider implements AiPlanGenerationProvider {
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly maxOutputTokens: number;
  private readonly temperature: number;

  constructor(cfg: GoogleProviderConfig = {}) {
    this.apiKey = cfg.apiKey ?? googleAiEnv.apiKey;
    this.model = cfg.model ?? 'gemini-1.5-flash';
    this.maxOutputTokens = cfg.maxOutputTokens ?? googleAiEnv.maxOutputTokens;
    this.temperature = cfg.temperature ?? 0.2;
  }

  async generate(
    input: GenerationInput,
    _options?: GenerationOptions
  ): Promise<ProviderGenerateResult> {
    // Prefer explicit key when provided; otherwise use default provider that
    // reads GOOGLE_GENERATIVE_AI_API_KEY from env.
    const provider = this.apiKey
      ? createGoogleGenerativeAI({ apiKey: this.apiKey })
      : google;

    const { plan, usage } = await generatePlanObject({
      model: provider(this.model),
      input,
      maxOutputTokens: this.maxOutputTokens,
      temperature: this.temperature,
    });

    return buildPlanProviderResult({
      plan,
      usage,
      provider: 'google',
      model: this.model,
    });
  }
}
