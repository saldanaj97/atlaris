import {
  generateObject,
  type GenerateObjectResult,
  type LanguageModel,
} from 'ai';

import { buildSystemPrompt, buildUserPrompt } from '@/lib/ai/prompts';
import { PlanSchema, type PlanOutput } from '@/lib/ai/schema';
import type {
  GenerationInput,
  ProviderUsage,
} from '@/lib/ai/types/provider.types';
import { toStream } from '@/lib/ai/utils';

export type PlanGenerationUsage = Pick<
  NonNullable<GenerateObjectResult<PlanOutput>['usage']>,
  'inputTokens' | 'outputTokens' | 'totalTokens'
>;

export interface GeneratePlanObjectResult {
  plan: PlanOutput;
  usage: PlanGenerationUsage | undefined;
}

type GeneratePlanObjectParams = {
  model: LanguageModel;
  input: GenerationInput;
  maxOutputTokens: number;
  temperature: number;
};

export async function generatePlanObject({
  model,
  input,
  maxOutputTokens,
  temperature,
}: GeneratePlanObjectParams): Promise<GeneratePlanObjectResult> {
  const { object, usage } = await generateObject({
    model,
    schema: PlanSchema,
    system: buildSystemPrompt(),
    prompt: buildUserPrompt({
      topic: input.topic,
      notes: input.notes,
      pdfContext: input.pdfContext,
      skillLevel: input.skillLevel,
      learningStyle: input.learningStyle,
      weeklyHours: input.weeklyHours,
      startDate: input.startDate,
      deadlineDate: input.deadlineDate,
    }),
    maxOutputTokens,
    temperature,
  });

  return {
    plan: object,
    usage,
  };
}

export type BuildPlanProviderResultParams = {
  plan: PlanOutput;
  usage?: PlanGenerationUsage;
  provider: string;
  model: string;
};

export interface BuildPlanProviderResultMetadata {
  provider: string;
  model: string;
  usage: ProviderUsage;
}

export interface BuildPlanProviderResult {
  stream: ReadableStream<string>;
  metadata: BuildPlanProviderResultMetadata;
}

export const buildPlanProviderResult = ({
  plan,
  usage,
  provider,
  model,
}: BuildPlanProviderResultParams): BuildPlanProviderResult => ({
  stream: toStream(plan),
  metadata: {
    provider,
    model,
    usage: {
      promptTokens: usage?.inputTokens,
      completionTokens: usage?.outputTokens,
      totalTokens: usage?.totalTokens,
    },
  },
});
