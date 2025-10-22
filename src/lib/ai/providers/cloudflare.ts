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
    [Symbol.asyncIterator](): AsyncIterator<string> {
      let done = false;
      return {
        next(): Promise<IteratorResult<string>> {
          if (done) return Promise.resolve({ done: true, value: undefined });
          done = true;
          return Promise.resolve({ done: false, value: data });
        },
      };
    },
  } as AsyncIterable<string>;
}

export interface CloudflareProviderConfig {
  apiToken?: string; // CF_API_TOKEN
  accountId?: string; // CF_ACCOUNT_ID
  baseURL?: string; // Prefer gateway or Workers AI OpenAI-compatible endpoint
  model?: string; // e.g., '@cf/meta/llama-3.1-8b-instruct'
  maxOutputTokens?: number;
  temperature?: number;
}

export class CloudflareAiProvider implements AiPlanGenerationProvider {
  private readonly apiToken?: string;
  private readonly baseURL: string;
  private readonly model: string;
  private readonly maxOutputTokens: number;
  private readonly temperature: number;

  constructor(cfg: CloudflareProviderConfig = {}) {
    this.apiToken =
      cfg.apiToken ?? process.env.CF_API_TOKEN ?? process.env.CF_API_KEY;
    const rawFromEnv =
      cfg.baseURL ||
      process.env.CF_AI_GATEWAY ||
      (process.env.CF_ACCOUNT_ID
        ? `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/v1`
        : undefined);

    // If a Cloudflare AI Gateway URL is provided but points to the Workers AI
    // path ("/workers-ai/"), switch to the OpenAI-compatible path ("/openai").
    // The @ai-sdk/openai client expects an OpenAI-compatible API surface.
    let normalizedBase =
      rawFromEnv ??
      'https://api.cloudflare.com/client/v4/accounts/undefined/ai/v1';
    if (
      /gateway\.ai\.cloudflare\.com\/v1\/[^/]+\/[^/]+\/workers-ai\/?$/.test(
        normalizedBase
      )
    ) {
      normalizedBase = normalizedBase.replace(/\/workers-ai\/?$/, '/openai');
    }
    this.baseURL = normalizedBase;

    // Normalize model id for OpenAI-compatible endpoints: drop the "@cf/" prefix
    // if present (Workers AI ids use @cf/...; OpenAI compat uses vendor/model only).
    const resolvedModel = cfg.model ?? '@cf/meta/llama-3.1-8b-instruct';
    this.model = this.baseURL.includes('/openai')
      ? resolvedModel.replace(/^@cf\//, '')
      : resolvedModel;
    this.maxOutputTokens =
      cfg.maxOutputTokens ??
      parseInt(process.env.AI_MAX_OUTPUT_TOKENS ?? '1200', 10);
    this.temperature = cfg.temperature ?? 0.2;
  }

  async generate(
    input: GenerationInput,
    _options?: GenerationOptions
  ): Promise<ProviderGenerateResult> {
    if (!this.apiToken) {
      throw new Error('CF_API_TOKEN is not set');
    }

    if (process.env.NODE_ENV !== 'production') {
      console.info(
        JSON.stringify({
          source: 'ai-provider',
          level: 'info',
          event: 'cloudflare_config',
          baseURL: this.baseURL,
          model: this.model,
        })
      );
    }

    // Guard: ensure we are using the OpenAI-compatible endpoint.
    if (this.baseURL.includes('api.openai.com')) {
      throw new Error(
        'Cloudflare baseURL resolved to api.openai.com. Set CF_AI_GATEWAY to the Cloudflare OpenAI-compatible endpoint (…/openai).'
      );
    }
    if (
      this.baseURL.includes('/client/v4/accounts/') &&
      !this.baseURL.includes('/openai')
    ) {
      throw new Error(
        'Cloudflare Workers AI requires the OpenAI-compatible Gateway baseURL ending with /openai when using createOpenAI. Set CF_AI_GATEWAY accordingly.'
      );
    }

    const openai = createOpenAI({
      apiKey: this.apiToken,
      baseURL: this.baseURL,
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
        startDate: input.startDate,
        deadlineDate: input.deadlineDate,
      }),
      maxOutputTokens: this.maxOutputTokens,
      temperature: this.temperature,
    });

    return {
      stream: toStream(plan),
      metadata: {
        provider: 'cloudflare',
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
