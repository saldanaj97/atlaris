import type { GroundedModelChoice } from '@/features/ai/model-operation-policy';
import type { OpenRouterPromptPart } from '@/features/ai/providers/openrouter';
import type {
  ResearchBrief,
  ResearchCitationKey,
} from '@/features/plans/research/contract';
import type { PlanResearchWithSources } from '@/lib/db/queries/types/plan-research.types';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';
import type { ModuleLessonBatchProviderOutput } from '@/shared/types/lesson-content.types';

import { getGroundedModelRoute } from '@/features/ai/model-operation-policy';
import { ParserError } from '@/features/ai/parser';
import { ProviderInvalidResponseError } from '@/features/ai/providers/errors';
import { sendOpenRouterGroundedChat } from '@/features/ai/providers/openrouter';
import { extractFirstJsonObject } from '@/features/ai/providers/openrouter-json';
import { safeNormalizeUsage } from '@/features/ai/usage';
import {
  checkLessonCitations,
  citedSourceIds,
} from '@/features/lesson-content/lesson-citation-checks';
import {
  bufferModuleLessonBatchStream,
  parseModuleLessonBatchText,
} from '@/features/lesson-content/parse-module-lesson-batch';
import { openRouterEnv } from '@/lib/config/env/ai';

export const GROUNDED_LESSON_STAGE = 'grounded-lesson';

export type GroundedLesson = ModuleLessonBatchProviderOutput['tasks'][number];

export type GroundedLessonRaw = {
  readonly rawText: string;
  readonly usage: CanonicalAIUsage;
  readonly finishReason?: string;
};

export function groundedLessonModels(
  tier: SubscriptionTier,
  pickedModelId?: string | null,
): readonly GroundedModelChoice[] {
  const models = getGroundedModelRoute(tier, 'lesson', pickedModelId);
  if (!models || models.length === 0) {
    throw new Error(`Grounded lessons are not configured for tier ${tier}`);
  }
  return models;
}

export function requireLessonPreset(): string {
  const slug = openRouterEnv.lessonPreset?.trim();
  if (!slug) {
    throw new Error('OPENROUTER_LESSON_PRESET is not set');
  }
  return slug;
}

export async function writeGroundedLesson(
  call: {
    readonly tier: SubscriptionTier;
    readonly planId: string;
    readonly models: readonly GroundedModelChoice[];
    readonly userParts: readonly OpenRouterPromptPart[];
    readonly signal?: AbortSignal;
    readonly timeoutMs?: number;
  },
  deps: { readonly fetch?: typeof fetch } = {},
): Promise<GroundedLessonRaw> {
  const [primary, ...fallbacks] = call.models;
  if (!primary) {
    throw new Error('No models for the grounded lesson call');
  }
  const { stream, metadata } = await sendOpenRouterGroundedChat(
    {
      tier: call.tier,
      model: primary.modelId,
      fallbackModels: fallbacks.map((model) => model.modelId),
      presetSlug: requireLessonPreset(),
      stage: GROUNDED_LESSON_STAGE,
      userParts: call.userParts,
      promptCacheKey: call.planId,
      responseFormat: { type: 'json_object' },
      signal: call.signal,
      timeoutMs: call.timeoutMs,
    },
    deps,
  );
  const rawText = await bufferModuleLessonBatchStream(stream, {
    signal: call.signal,
  });
  return {
    rawText,
    usage: await safeNormalizeUsage(metadata),
    finishReason: metadata.finishReason,
  };
}

export function parseGroundedLessonText(
  rawText: string,
  taskId: string,
  research: ResearchBrief | null,
): GroundedLesson {
  let json: unknown;
  try {
    json = extractFirstJsonObject(rawText);
  } catch (error) {
    if (error instanceof ProviderInvalidResponseError) {
      throw new ParserError(
        'invalid_json',
        'Grounded lesson response contained no JSON object.',
        { cause: error },
      );
    }
    throw error;
  }

  const [task] = parseModuleLessonBatchText(JSON.stringify(json), [
    taskId,
  ]).tasks;
  if (!task) {
    throw new ParserError('validation', 'Grounded lesson has no task.');
  }
  const content = {
    ...task.content,
    sourceIds: citedSourceIds(task.content.blocks),
  };

  const issues = checkLessonCitations(content, research);
  if (issues.length > 0) {
    throw new ParserError(
      'validation',
      `Grounded lesson failed citation checks: ${issues
        .map((issue) => `${issue.code} at ${issue.blockRef}`)
        .join(', ')}`,
    );
  }
  return { taskId: task.taskId, content };
}

/**
 * The brief and sources lessons cite, from the plan's latest research run.
 * `null` (no citations allowed) when the plan has no run, the run was
 * `failed_skipped`, or it kept no sources.
 */
export function toLessonResearch(
  latest: PlanResearchWithSources | null,
): ResearchBrief | null {
  if (
    !latest ||
    latest.research.status !== 'ok' ||
    latest.sources.length === 0
  ) {
    return null;
  }
  return {
    brief: latest.research.brief,
    sources: latest.sources.map((source) => ({
      key: source.citationKey as ResearchCitationKey,
      title: source.title,
      url: source.url,
      publisher:
        source.publisher ?? new URL(source.url).hostname.replace(/^www\./i, ''),
    })),
  };
}
