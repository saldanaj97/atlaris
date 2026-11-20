import type {
  GroundedModelChoice,
  GroundedOperation,
} from '@/features/ai/model-operation-policy';
import type {
  OpenRouterPromptPart,
  OpenRouterResponseFormat,
} from '@/features/ai/providers/openrouter';
import type { OpenRouterGroundedMetadata } from '@/features/ai/providers/openrouter-grounded-response';
import type { AiPlanGenerationProvider } from '@/features/ai/types/provider.types';
import type { ResearchBrief } from '@/features/plans/research/contract';
import type { GenerationInput } from '@/shared/types/ai-provider.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';

import { getGroundedModelRoute } from '@/features/ai/model-operation-policy';
import { sendOpenRouterGroundedChat } from '@/features/ai/providers/openrouter';
import { extractFirstJsonObject } from '@/features/ai/providers/openrouter-json';
import {
  readableStreamToAsyncIterable,
  toStream,
} from '@/features/ai/streaming/utils';
import { completeUsageOrNull, withBilledUsage } from '@/features/ai/usage';
import { buildGroundedOutlineUserParts } from '@/features/plans/outline/contract';
import { openRouterEnv } from '@/lib/config/env/ai';

export const OUTLINE_STAGE = 'grounded-outline';

export type OutlinePurpose = 'initial' | 'regeneration';

export type GroundedCallDeps = {
  fetch?: typeof fetch;
};

export type GroundedJsonCall = {
  tier: SubscriptionTier;
  models: readonly GroundedModelChoice[];
  presetSlug: string;
  stage: string;
  userParts: readonly OpenRouterPromptPart[];
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type GroundedJsonResult = {
  value: unknown;
  metadata: OpenRouterGroundedMetadata;
};

const JSON_OBJECT_FORMAT: OpenRouterResponseFormat = { type: 'json_object' };

export function outlineOperation(purpose: OutlinePurpose): GroundedOperation {
  return purpose === 'initial' ? 'initial_outline' : 'regeneration';
}

export function outlineWriterModels(
  tier: SubscriptionTier,
  purpose: OutlinePurpose,
  modelOverride?: string | null,
): readonly GroundedModelChoice[] {
  const models = getGroundedModelRoute(
    tier,
    outlineOperation(purpose),
    modelOverride,
  );
  if (!models || models.length === 0) {
    throw new Error(`Grounded outline is not configured for tier ${tier}`);
  }
  return models;
}

export function requirePlanPreset(): string {
  const slug = openRouterEnv.planPreset?.trim();
  if (!slug) {
    throw new Error('OPENROUTER_PLAN_PRESET is not set');
  }
  return slug;
}

async function readText(stream: ReadableStream<string>): Promise<string> {
  let text = '';
  for await (const chunk of readableStreamToAsyncIterable(stream)) {
    text += chunk;
  }
  return text;
}

export async function sendGroundedJsonCall(
  call: GroundedJsonCall,
  deps: GroundedCallDeps = {},
): Promise<GroundedJsonResult> {
  const [primary, ...fallbacks] = call.models;
  if (!primary) {
    throw new Error(`No models for ${call.stage}`);
  }
  const { stream, metadata } = await sendOpenRouterGroundedChat(
    {
      tier: call.tier,
      model: primary.modelId,
      fallbackModels: fallbacks.map((model) => model.modelId),
      presetSlug: call.presetSlug,
      stage: call.stage,
      userParts: call.userParts,
      responseFormat: JSON_OBJECT_FORMAT,
      signal: call.signal,
      timeoutMs: call.timeoutMs,
    },
    deps,
  );
  const value = await withBilledUsage(
    () => completeUsageOrNull(metadata),
    async () => extractFirstJsonObject(await readText(stream)),
  );
  return { value, metadata };
}

/**
 * The outline writer for a grounded run. It plugs into the existing
 * generation path, which parses, paces and records the result; it adds the
 * research brief and the title-scope contract to the prompt. Output goes
 * through `extractFirstJsonObject`, since some models wrap JSON in prose.
 */
export function createGroundedOutlineProvider(
  params: {
    tier: SubscriptionTier;
    purpose: OutlinePurpose;
    modelOverride?: string | null;
    research: ResearchBrief | null;
    guidance?: string | null;
  },
  deps: GroundedCallDeps = {},
): AiPlanGenerationProvider {
  return {
    async generate(input: GenerationInput, options) {
      const { value, metadata } = await sendGroundedJsonCall(
        {
          tier: params.tier,
          models: outlineWriterModels(
            params.tier,
            params.purpose,
            params.modelOverride,
          ),
          presetSlug: requirePlanPreset(),
          stage: OUTLINE_STAGE,
          userParts: buildGroundedOutlineUserParts(
            input,
            params.research,
            params.guidance,
          ),
          signal: options?.signal,
          timeoutMs: options?.timeoutMs,
        },
        deps,
      );
      return { stream: toStream(value), metadata };
    },
    generateModuleLessonBatch() {
      return Promise.reject(
        new Error('The grounded outline writer does not write lessons'),
      );
    },
  };
}
