import { OpenRouter } from '@openrouter/sdk';
import * as Sentry from '@sentry/nextjs';

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

export type OpenRouterChatResponse = Awaited<
  ReturnType<OpenRouter['chat']['send']>
>;

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
    options?: GenerationOptions
  ): Promise<ProviderGenerateResult> {
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt({
      topic: input.topic,
      notes: input.notes,
      pdfContext: input.pdfContext,
      skillLevel: input.skillLevel,
      learningStyle: input.learningStyle,
      weeklyHours: input.weeklyHours,
      startDate: input.startDate,
      deadlineDate: input.deadlineDate,
    });

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];

    return Sentry.startSpan(
      {
        op: 'gen_ai.request',
        name: `request ${this.model}`,
        attributes: {
          'gen_ai.request.model': this.model,
          'gen_ai.request.messages': JSON.stringify(messages),
          'gen_ai.request.temperature': this.temperature,
        },
      },
      async (span) => {
        const requestOptions: {
          signal?: AbortSignal;
          timeoutMs?: number;
        } = {};
        if (options?.signal) {
          requestOptions.signal = options.signal;
        }
        if (options?.timeoutMs != null && options.timeoutMs > 0) {
          requestOptions.timeoutMs = options.timeoutMs;
        }

        let response: OpenRouterChatResponse;
        try {
          response = await this.client.chat.send(
            {
              model: this.model,
              messages,
              stream: false,
              temperature: this.temperature,
              responseFormat: { type: 'json_object' },
              provider: { requireParameters: true },
            },
            requestOptions
          );
        } catch (err) {
          const errorDetails = {
            source: 'openrouter-provider',
            event: 'api_error',
            model: this.model,
            errorMessage: err instanceof Error ? err.message : String(err),
            errorName: err instanceof Error ? err.name : 'Unknown',
            ...(err && typeof err === 'object' && 'code' in err
              ? { errorCode: (err as { code: unknown }).code }
              : {}),
            ...(err && typeof err === 'object' && 'status' in err
              ? { httpStatus: (err as { status: unknown }).status }
              : {}),
            ...(err && typeof err === 'object' && 'body' in err
              ? {
                  responseBody: JSON.stringify((err as { body: unknown }).body),
                }
              : {}),
          };
          logger.error(errorDetails, 'OpenRouter API call failed');

          const message =
            err instanceof Error ? err.message : 'OpenRouter API call failed';
          const status =
            err && typeof err === 'object' && 'status' in err
              ? (err as { status: number }).status
              : undefined;
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

        const usage = response.usage;
        span.setAttribute(
          'gen_ai.response.text',
          JSON.stringify([content.slice(0, 10_000)])
        );
        if (usage) {
          span.setAttribute(
            'gen_ai.usage.input_tokens',
            usage.promptTokens ?? 0
          );
          span.setAttribute(
            'gen_ai.usage.output_tokens',
            usage.completionTokens ?? 0
          );
        }

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
    );
  }
}
