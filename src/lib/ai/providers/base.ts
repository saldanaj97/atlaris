import {
  generateObject,
  type GenerateObjectResult,
  type LanguageModel,
} from 'ai';

import {
  buildSystemPrompt,
  buildUserPrompt,
  type PromptParams,
} from '@/lib/ai/prompts';
import type { GenerationInput } from '@/lib/ai/provider';
import { PlanSchema, type PlanOutput } from '@/lib/ai/schema';
import { toStream } from '@/lib/ai/utils';

export type PlanGenerationUsage = Pick<
  NonNullable<GenerateObjectResult<PlanOutput>['usage']>,
  'inputTokens' | 'outputTokens' | 'totalTokens'
>;

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
}: GeneratePlanObjectParams) {
  const { object, usage } = await generateObject({
    model,
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

export const buildPlanProviderResult = ({
  plan,
  usage,
  provider,
  model,
}: BuildPlanProviderResultParams) => ({
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
