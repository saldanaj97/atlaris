import type { OpenRouterServerTool } from '@/features/ai/providers/openrouter-server-tools';
import type { LessonIssue } from '@/features/lesson-content/lesson-citation-checks';
import type { LessonQualityCallDeps } from '@/features/lesson-content/lesson-quality-call';
import type { ModuleLessonBatchPromptInput } from '@/features/lesson-content/module-lesson-prompts';
import type { ResearchBrief } from '@/features/plans/research/contract';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';
import type {
  LessonContent,
  LessonContentBlock,
} from '@/shared/types/lesson-content.types';

import {
  GROUNDED_PRESET_BY_OPERATION,
  getGroundedModelRoute,
} from '@/features/ai/model-operation-policy';
import { ProviderInvalidResponseError } from '@/features/ai/providers/errors';
import {
  buildLessonBriefPart,
  buildModuleOutlinePart,
} from '@/features/lesson-content/grounded-lesson-prompt';
import { groundedLessonModels } from '@/features/lesson-content/grounded-lesson-writer';
import { citedSourceIds } from '@/features/lesson-content/lesson-citation-checks';
import {
  describeLessonForReview,
  sendLessonQualityCall,
} from '@/features/lesson-content/lesson-quality-call';
import {
  LessonContentBlockSchema,
  LessonContentSchema,
} from '@/shared/schemas/lesson-content.schemas';
import { z } from 'zod';

/** Tagged on AI Gateway log entries. */
export const LESSON_REPAIR_STAGE = 'grounded-lesson-repair';

/** Repair passes per lesson, on every tier. */
export const LESSON_REPAIR_PASSES = 2;

/** Code-owned instructions for the advisor tool on paid repairs. */
export const LESSON_ADVISOR_INSTRUCTIONS =
  'You advise a model that is repairing one lesson. Read the lesson, the issues and the context it sends you. Say how to fix each issue with the smallest change: what is wrong, what the corrected text or data should be, and how to keep titles, setup data, examples and answer keys consistent with each other. Do not rewrite the whole lesson.';

const BLOCK_ONLY_PATTERN = /^blocks\[(\d+)\]/;

/**
 * Which part of the lesson a repair rewrites: only the flagged blocks, or
 * the whole lesson when an issue is about the lesson as a whole (a missing
 * block, the length, `sourceIds`).
 */
export type LessonRepairScope =
  | { readonly kind: 'blocks'; readonly indices: readonly number[] }
  | { readonly kind: 'lesson' };

export function lessonRepairScope(
  issues: readonly LessonIssue[],
): LessonRepairScope {
  const indices = new Set<number>();
  for (const issue of issues) {
    const match = BLOCK_ONLY_PATTERN.exec(issue.blockRef);
    if (!match) {
      return { kind: 'lesson' };
    }
    indices.add(Number(match[1]));
  }
  return { kind: 'blocks', indices: [...indices].sort((a, b) => a - b) };
}

export type LessonRepairRun = {
  readonly content: LessonContent;
  readonly model: string;
  readonly usage: CanonicalAIUsage;
  readonly advisor: boolean;
};

function formatIssues(issues: readonly LessonIssue[]): string {
  return issues
    .map((issue) => `- [${issue.blockRef}] ${issue.code}: ${issue.message}`)
    .join('\n');
}

function repairInstruction(scope: LessonRepairScope): string {
  if (scope.kind === 'lesson') {
    return 'Return the complete revised lesson as {"blocks":[...]} with the same block schema. Fix the listed issues and keep everything else unchanged.';
  }
  return `Rewrite only the flagged blocks (${scope.indices
    .map((index) => `blocks[${index}]`)
    .join(
      ', ',
    )}). Return {"blocks":[{"index":i,"block":{...}}]} with one entry per rewritten block, each block in the same schema. Fix the listed issues and keep everything else unchanged.`;
}

/** Brief and module outline first (cached), then the lesson and its issues. */
export function buildLessonRepairUserParts(input: {
  readonly promptInput: ModuleLessonBatchPromptInput;
  readonly taskIndex: number;
  readonly content: LessonContent;
  readonly issues: readonly LessonIssue[];
  readonly research: ResearchBrief | null;
}) {
  const { promptInput, taskIndex, content, issues, research } = input;
  const task = promptInput.tasks[taskIndex];
  if (!task) {
    throw new RangeError(`No lesson task at index ${taskIndex}`);
  }
  return [
    ...(research ? [buildLessonBriefPart(research)] : []),
    buildModuleOutlinePart(promptInput, research !== null),
    {
      text: [
        describeLessonForReview(
          task,
          taskIndex + 1,
          promptInput.tasks.length,
          content,
        ),
        '',
        'ISSUES TO FIX (blockRef points into the lesson blocks):',
        formatIssues(issues),
        '',
        repairInstruction(lessonRepairScope(issues)),
      ].join('\n'),
    },
  ];
}

const fullOutputSchema = z.object({
  blocks: LessonContentSchema.shape.blocks,
});

const patchOutputSchema = z.object({
  blocks: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      block: LessonContentBlockSchema,
    }),
  ),
});

/**
 * Applies the repair output to `content`. A block repair replaces only the
 * flagged blocks it returned; anything else it sent is ignored. `sourceIds`
 * is recomputed from the body, as for a written lesson.
 */
export function applyLessonRepairOutput(
  value: unknown,
  content: LessonContent,
  scope: LessonRepairScope,
): LessonContent {
  let blocks: LessonContentBlock[];
  if (scope.kind === 'lesson') {
    const parsed = fullOutputSchema.safeParse(value);
    if (!parsed.success) {
      throw new ProviderInvalidResponseError(
        'Lesson repair output did not match {blocks:[...]}',
      );
    }
    blocks = parsed.data.blocks;
  } else {
    const parsed = patchOutputSchema.safeParse(value);
    if (!parsed.success) {
      throw new ProviderInvalidResponseError(
        'Lesson repair output did not match {blocks:[{index, block}]}',
      );
    }
    const flagged = new Set(scope.indices);
    blocks = [...content.blocks];
    for (const patch of parsed.data.blocks) {
      if (flagged.has(patch.index) && patch.index < blocks.length) {
        blocks[patch.index] = patch.block;
      }
    }
  }
  return { ...content, blocks, sourceIds: citedSourceIds(blocks) };
}

/**
 * The advisor tool for a paid repair, or `null` on free. Its model is the
 * Pro advisor pick when allowed, else the tier's advisor route primary.
 */
export function lessonAdvisorTool(
  tier: SubscriptionTier,
  pickedModelId: string | null,
): OpenRouterServerTool | null {
  const route = getGroundedModelRoute(tier, 'advisor', pickedModelId);
  const model = route?.[0]?.modelId;
  if (!model) {
    return null;
  }
  return {
    type: 'advisor',
    model,
    instructions: LESSON_ADVISOR_INSTRUCTIONS,
  };
}

/**
 * One repair pass on a lesson: the writer models rewrite the flagged blocks
 * (or the whole lesson for a lesson-level issue) through the repair preset.
 * Starter and pro add the advisor tool with `tool_choice: required`; free
 * runs without it, as does a repair the plan's AI ceiling cut the advisor
 * from (`withAdvisor: false`). Throws on provider or output errors.
 */
export async function runLessonRepair(
  params: {
    readonly tier: SubscriptionTier;
    readonly planId: string;
    /** The Pro writer pick, as for the lesson writer. */
    readonly pickedModelId: string | null;
    /** The Pro advisor pick; the route ignores it on other tiers. */
    readonly advisorModelId: string | null;
    /** `false` drops the advisor tool (JCS-170). Defaults to `true`. */
    readonly withAdvisor?: boolean;
    readonly promptInput: ModuleLessonBatchPromptInput;
    readonly taskIndex: number;
    readonly content: LessonContent;
    readonly issues: readonly LessonIssue[];
    readonly research: ResearchBrief | null;
    readonly signal?: AbortSignal;
    readonly timeoutMs?: number;
  },
  deps: LessonQualityCallDeps = {},
): Promise<LessonRepairRun> {
  if (params.issues.length === 0) {
    throw new Error('Lesson repair needs at least one issue');
  }
  const advisor =
    params.withAdvisor === false
      ? null
      : lessonAdvisorTool(params.tier, params.advisorModelId);
  const { value, usage, model } = await sendLessonQualityCall(
    {
      tier: params.tier,
      planId: params.planId,
      models: groundedLessonModels(params.tier, params.pickedModelId),
      presetSlug: GROUNDED_PRESET_BY_OPERATION.advisor.slug,
      stage: LESSON_REPAIR_STAGE,
      userParts: buildLessonRepairUserParts(params),
      ...(advisor
        ? { serverTools: [advisor], toolChoice: 'required' as const }
        : {}),
      signal: params.signal,
      timeoutMs: params.timeoutMs,
    },
    deps,
  );
  return {
    content: applyLessonRepairOutput(
      value,
      params.content,
      lessonRepairScope(params.issues),
    ),
    model,
    usage,
    advisor: advisor !== null,
  };
}
