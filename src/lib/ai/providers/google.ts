import { createGoogleGenerativeAI, google } from '@ai-sdk/google';
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
