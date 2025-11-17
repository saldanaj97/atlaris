import { createGoogleGenerativeAI, google } from '@ai-sdk/google';
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
import { toStream } from '@/lib/ai/utils';
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

    const { object: plan, usage } = await generateObject({
      model: provider(this.model),
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
        provider: 'google',
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
