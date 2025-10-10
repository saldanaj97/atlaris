import { google, createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';

import { buildSystemPrompt, buildUserPrompt } from '@/lib/ai/prompts';
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
    this.apiKey = cfg.apiKey ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    this.model = cfg.model ?? 'gemini-1.5-flash';
    this.maxOutputTokens =
      cfg.maxOutputTokens ??
      parseInt(process.env.AI_MAX_OUTPUT_TOKENS ?? '1200', 10);
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
        skillLevel: input.skillLevel as any,
        learningStyle: input.learningStyle as any,
        weeklyHours: input.weeklyHours,
      }),
      maxTokens: this.maxOutputTokens,
      temperature: this.temperature,
    });

    return {
      stream: toStream(plan),
      metadata: {
        provider: 'google',
        model: this.model,
        usage: {
          promptTokens: usage?.promptTokens,
          completionTokens: usage?.completionTokens,
          totalTokens: usage?.totalTokens,
        },
      },
    };
  }
}
