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

/** Tagged on AI Gateway log entries. */
export const GROUNDED_LESSON_STAGE = 'grounded-lesson';

export type GroundedLesson = ModuleLessonBatchProviderOutput['tasks'][number];

export type GroundedLessonRaw = {
  readonly rawText: string;
  readonly usage: CanonicalAIUsage;
  readonly finishReason?: string;
};

/** The lesson writer models for `tier`, a Pro pick first when it is allowed. */
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

/** The existing lesson preset, which grounded lesson calls share. */
export function requireLessonPreset(): string {
  const slug = openRouterEnv.lessonPreset?.trim();
  if (!slug) {
    throw new Error('OPENROUTER_LESSON_PRESET is not set');
  }
  return slug;
}

/**
 * One lesson call with no tools. `prompt_cache_key` is the plan ID, so every
 * lesson in the plan routes to the cache its shared prefix wrote. Later
 * models in `models` are OpenRouter fallbacks for a failed primary.
 */
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
    usage: safeNormalizeUsage(metadata),
    finishReason: metadata.finishReason,
  };
}

/**
 * Parses one lesson: the first JSON object in the text, the batch envelope
 * with exactly this task, then `sourceIds` from the body's `[S1]` markers
 * (any value the model sent is replaced) and the citation checks. Throws
 * `ParserError`; a citation issue is a `validation` failure, so the lesson
 * gets its one retry.
 */
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

/** One usage record for the module: token and cost totals across lessons. */
export function sumLessonUsage(
  usages: readonly [CanonicalAIUsage, ...CanonicalAIUsage[]],
): CanonicalAIUsage {
  const [first] = usages;
  const missingFields = [...new Set(usages.flatMap((u) => u.missingFields))];
  return {
    inputTokens: usages.reduce((sum, u) => sum + u.inputTokens, 0),
    outputTokens: usages.reduce((sum, u) => sum + u.outputTokens, 0),
    totalTokens: usages.reduce((sum, u) => sum + u.totalTokens, 0),
    model: first.model,
    provider: first.provider,
    estimatedCostCents: usages.reduce(
      (sum, u) => sum + u.estimatedCostCents,
      0,
    ),
    // A total is known only when every lesson's cost is.
    providerCostMicrousd: usages.every((u) => u.providerCostMicrousd !== null)
      ? usages.reduce((sum, u) => sum + (u.providerCostMicrousd ?? 0), 0)
      : null,
    isPartial: usages.some((u) => u.isPartial),
    missingFields,
  };
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
      // A CHECK constraint holds `citation_key` to `S<n>`.
      key: source.citationKey as ResearchCitationKey,
      title: source.title,
      url: source.url,
      publisher:
        source.publisher ?? new URL(source.url).hostname.replace(/^www\./i, ''),
    })),
  };
}
