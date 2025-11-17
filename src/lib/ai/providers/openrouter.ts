import { createOpenAI } from '@ai-sdk/openai';
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
import { openRouterEnv } from '@/lib/config/env';

export interface OpenRouterProviderConfig {
  apiKey?: string; // OPENROUTER_API_KEY
  baseURL?: string; // https://openrouter.ai/api/v1
  model?: string; // e.g., 'google/gemini-2.0-pro-exp' or other
  siteUrl?: string;
  appName?: string;
  maxOutputTokens?: number;
  temperature?: number;
}

export class OpenRouterProvider implements AiPlanGenerationProvider {
  private readonly apiKey?: string;
  private readonly baseURL: string;
  private readonly model: string;
  private readonly headers: Record<string, string>;
  private readonly maxOutputTokens: number;
  private readonly temperature: number;

  constructor(cfg: OpenRouterProviderConfig = {}) {
    this.apiKey = cfg.apiKey ?? openRouterEnv.apiKey;
    this.baseURL =
      cfg.baseURL ?? openRouterEnv.baseUrl ?? 'https://openrouter.ai/api/v1';
    this.model = cfg.model ?? 'google/gemini-2.0-pro-exp';
    this.headers = {};
    const site = cfg.siteUrl ?? openRouterEnv.siteUrl;
    const app = cfg.appName ?? openRouterEnv.appName;
    if (site) this.headers['HTTP-Referer'] = site;
    if (app) this.headers['X-Title'] = app;
    this.maxOutputTokens = cfg.maxOutputTokens ?? openRouterEnv.maxOutputTokens;
    this.temperature = cfg.temperature ?? 0.2;
  }

  async generate(
    input: GenerationInput,
    _options?: GenerationOptions
  ): Promise<ProviderGenerateResult> {
    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY is not set');
    }

    const openai = createOpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseURL,
      headers: this.headers,
    });

    const { plan, usage } = await generatePlanObject({
      model: openai(this.model),
      input,
      maxOutputTokens: this.maxOutputTokens,
      temperature: this.temperature,
    });

    return buildPlanProviderResult({
      plan,
      usage,
      provider: 'openrouter',
      model: this.model,
    });
  }
}
