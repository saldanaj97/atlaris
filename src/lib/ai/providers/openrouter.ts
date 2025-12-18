import { OpenRouter } from '@openrouter/sdk';

import { buildSystemPrompt, buildUserPrompt } from '@/lib/ai/prompts';
import { ProviderError, ProviderInvalidResponseError } from '@/lib/ai/provider';
import { buildPlanProviderResult } from '@/lib/ai/providers/base';
import { PlanSchema } from '@/lib/ai/schema';
import type {
  AiPlanGenerationProvider,
  GenerationInput,
  GenerationOptions,
  ProviderGenerateResult,
} from '@/lib/ai/types/provider.types';
import { openRouterEnv } from '@/lib/config/env';
import { logger } from '@/lib/logging/logger';

export interface OpenRouterProviderConfig {
  apiKey?: string;
  model: string;
  siteUrl?: string;
  appName?: string;
  temperature?: number;
}

export class OpenRouterProvider implements AiPlanGenerationProvider {
  private readonly client: OpenRouter;
  private readonly model: string;
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
    this.temperature = cfg.temperature ?? 0.2;
  }

  // TODO: Implement streaming support in a follow-up for better UX with large plans
  // NOTE: Track this improvement in an issue to follow up on streaming behavior.
  async generate(
    input: GenerationInput,
    _options?: GenerationOptions
  ): Promise<ProviderGenerateResult> {
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt({
      topic: input.topic,
      skillLevel: input.skillLevel,
      learningStyle: input.learningStyle,
      weeklyHours: input.weeklyHours,
      startDate: input.startDate,
      deadlineDate: input.deadlineDate,
    });

    let response;
    try {
      response = await this.client.chat.send({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: false,
        temperature: this.temperature,
        responseFormat: { type: 'json_object' },
        // Ensure OpenRouter only routes to providers that support JSON response format
        provider: { requireParameters: true },
      });
    } catch (err) {
      // Log the full error details for debugging
      const errorDetails = {
        source: 'openrouter-provider',
        event: 'api_error',
        model: this.model,
        errorMessage: err instanceof Error ? err.message : String(err),
        errorName: err instanceof Error ? err.name : 'Unknown',
        // Capture OpenRouter-specific error details if available
        ...(err && typeof err === 'object' && 'code' in err
          ? { errorCode: (err as { code: unknown }).code }
          : {}),
        ...(err && typeof err === 'object' && 'status' in err
          ? { httpStatus: (err as { status: unknown }).status }
          : {}),
        ...(err && typeof err === 'object' && 'body' in err
          ? { responseBody: JSON.stringify((err as { body: unknown }).body) }
          : {}),
      };
      logger.error(errorDetails, 'OpenRouter API call failed');

      // Classify error based on HTTP status code for better retry handling
      const message =
        err instanceof Error ? err.message : 'OpenRouter API call failed';

      const status =
        err && typeof err === 'object' && 'status' in err
          ? (err as { status: number }).status
          : undefined;

      // Map HTTP status codes to provider error kinds
      const kind =
        status === 429
          ? 'rate_limit'
          : status === 408 || message.toLowerCase().includes('timeout')
            ? 'timeout'
            : 'unknown';

      throw new ProviderError(kind, message);
    }

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
