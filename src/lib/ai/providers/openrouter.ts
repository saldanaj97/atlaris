import { OpenRouter } from '@openrouter/sdk';

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
import { ProviderInvalidResponseError } from '@/lib/ai/provider';
import { buildPlanProviderResult } from '@/lib/ai/providers/base';
import { PlanSchema } from '@/lib/ai/schema';
import { openRouterEnv } from '@/lib/config/env';

export interface OpenRouterProviderConfig {
  apiKey?: string; // OPENROUTER_API_KEY
  /**
   * OpenRouter model ID (e.g., 'google/gemini-2.0-flash-exp:free').
   * Required - no default fallback. Use getGenerationProviderWithModel() to specify.
   */
  model: string;
  siteUrl?: string;
  appName?: string;
  maxOutputTokens?: number;
  temperature?: number;
}

export class OpenRouterProvider implements AiPlanGenerationProvider {
  private readonly client: OpenRouter;
  private readonly model: string;
  private readonly maxOutputTokens: number;
  private readonly temperature: number;

  constructor(cfg: OpenRouterProviderConfig) {
    const apiKey = cfg.apiKey ?? openRouterEnv.apiKey;

    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is not set');
    }

    const siteUrl = cfg.siteUrl ?? openRouterEnv.siteUrl;
    const appName = cfg.appName ?? openRouterEnv.appName;

    this.client = new OpenRouter({
      apiKey,
      ...(siteUrl && { siteUrl }),
      ...(appName && { appName }),
    });

    if (!cfg.model) {
      throw new Error('OpenRouterProvider requires a model to be specified');
    }
    this.model = cfg.model;
    this.maxOutputTokens = cfg.maxOutputTokens ?? openRouterEnv.maxOutputTokens;
    this.temperature = cfg.temperature ?? 0.2;
  }

  // TODO: Implement streaming support in a follow-up for better UX with large plans
  async generate(
    input: GenerationInput,
    _options?: GenerationOptions
  ): Promise<ProviderGenerateResult> {
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt({
      topic: input.topic,
      skillLevel: input.skillLevel as PromptParams['skillLevel'],
      learningStyle: input.learningStyle as PromptParams['learningStyle'],
      weeklyHours: input.weeklyHours,
      startDate: input.startDate,
      deadlineDate: input.deadlineDate,
    });

    const response = await this.client.chat.send({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: false,
      temperature: this.temperature,
      maxTokens: this.maxOutputTokens,
      responseFormat: { type: 'json_object' },
    });

    const rawContent = response.choices?.[0]?.message?.content;

    if (!rawContent) {
      throw new ProviderInvalidResponseError(
        'OpenRouter returned an empty response'
      );
    }

    // Content can be a string or an array of content items; extract text content
    const content =
      typeof rawContent === 'string'
        ? rawContent
        : rawContent
            .filter(
              (item): item is { type: 'text'; text: string } =>
                item.type === 'text'
            )
            .map((item) => item.text)
            .join('');

    if (!content) {
      throw new ProviderInvalidResponseError(
        'OpenRouter returned no text content'
      );
    }

    // Parse and validate the JSON response against PlanSchema
    let parsedContent: unknown;
    try {
      parsedContent = JSON.parse(content);
    } catch {
      throw new ProviderInvalidResponseError(
        'OpenRouter returned invalid JSON'
      );
    }

    const parseResult = PlanSchema.safeParse(parsedContent);

    if (!parseResult.success) {
      throw new ProviderInvalidResponseError(
        `OpenRouter response failed schema validation: ${parseResult.error.message}`
      );
    }

    const plan = parseResult.data;
    const usage = response.usage;

    return buildPlanProviderResult({
      plan,
      usage: usage
        ? {
            inputTokens: usage.promptTokens,
            outputTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
          }
        : undefined,
      provider: 'openrouter',
      model: this.model,
    });
  }
}
