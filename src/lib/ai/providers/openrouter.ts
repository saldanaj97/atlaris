import { createOpenAI } from '@ai-sdk/openai';
import { generateObject } from 'ai';

import {
  buildSystemPrompt,
  buildUserPrompt,
  type PromptParams,
} from '@/lib/ai/prompts';
import type {
  AiPlanGenerationProvider,
  GenerationInput,
  GenerationOptions,
  ProviderGenerateResult,
} from '@/lib/ai/provider';
import { PlanSchema } from '@/lib/ai/schema';

function toStream(obj: unknown): AsyncIterable<string> {
  const data = JSON.stringify(obj);
  return {
    async *[Symbol.asyncIterator]() {
      yield data;
    },
  } as AsyncIterable<string>;
}

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
    this.apiKey = cfg.apiKey ?? process.env.OPENROUTER_API_KEY;
    this.baseURL = cfg.baseURL ?? 'https://openrouter.ai/api/v1';
    this.model = cfg.model ?? 'google/gemini-2.0-pro-exp';
    this.headers = {};
    const site = cfg.siteUrl ?? process.env.OPENROUTER_SITE_URL;
    const app = cfg.appName ?? process.env.OPENROUTER_APP_NAME;
    if (site) this.headers['HTTP-Referer'] = site;
    if (app) this.headers['X-Title'] = app;
    this.maxOutputTokens =
      cfg.maxOutputTokens ??
      parseInt(process.env.AI_MAX_OUTPUT_TOKENS ?? '1200', 10);
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

    const { object: plan, usage } = await generateObject({
      model: openai(this.model),
      schema: PlanSchema,
      system: buildSystemPrompt(),
      prompt: buildUserPrompt({
        topic: input.topic,
        skillLevel: input.skillLevel as PromptParams['skillLevel'],
        learningStyle: input.learningStyle as PromptParams['learningStyle'],
        weeklyHours: input.weeklyHours,
      }),
      maxOutputTokens: this.maxOutputTokens,
      temperature: this.temperature,
    });

    return {
      stream: toStream(plan),
      metadata: {
        provider: 'openrouter',
        model: this.model,
        usage: {
          promptTokens: usage?.inputTokens,
          completionTokens: usage?.outputTokens,
          totalTokens: usage?.totalTokens,
        },
      },
    };
  }
}
