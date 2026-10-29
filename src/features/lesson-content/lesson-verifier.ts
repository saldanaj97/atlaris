import type { LessonIssue } from '@/features/lesson-content/lesson-citation-checks';
import type { LessonQualityCallDeps } from '@/features/lesson-content/lesson-quality-call';
import type { ModuleLessonBatchPromptInput } from '@/features/lesson-content/module-lesson-prompts';
import type { ResearchBrief } from '@/features/plans/research/contract';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';
import type { LessonContent } from '@/shared/types/lesson-content.types';

import {
  GROUNDED_PRESET_BY_OPERATION,
  getGroundedModelRoute,
} from '@/features/ai/model-operation-policy';
import { ProviderInvalidResponseError } from '@/features/ai/providers/errors';
import { withBilledUsage } from '@/features/ai/usage';
import {
  buildLessonBriefPart,
  buildModuleOutlinePart,
} from '@/features/lesson-content/grounded-lesson-prompt';
import { LESSON_BLOCK_REF } from '@/features/lesson-content/lesson-checks';
import {
  describeLessonForReview,
  sendLessonQualityCall,
} from '@/features/lesson-content/lesson-quality-call';
import { z } from 'zod';

/** Tagged on AI Gateway log entries. */
export const LESSON_VERIFY_STAGE = 'grounded-lesson-verify';

/** Issues kept from one verifier call; the rest are dropped. */
export const MAX_LESSON_VERIFIER_ISSUES = 20;

const BLOCK_REF_PATTERN = /^blocks\[(\d+)\](?:\.items\[(\d+)\])?$/;

const verifierOutputSchema = z.object({
  issues: z.array(
    z.object({
      code: z.string().trim().min(1),
      blockRef: z.string().trim().nullish(),
      message: z.string().trim().min(1),
    }),
  ),
});

export type LessonVerifierRun = {
  readonly issues: LessonIssue[];
  readonly model: string;
  readonly usage: CanonicalAIUsage;
};

/** Free runs code checks only; starter and pro also run the verifier. */
export function isLessonVerifierAvailable(tier: SubscriptionTier): boolean {
  return getGroundedModelRoute(tier, 'lesson_verify') !== null;
}

/** Verifier codes are namespaced `verifier.<code>`, lowercase snake case. */
function toVerifierCode(code: string): string {
  const slug = code
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return `verifier.${slug || 'issue'}`;
}

/** A ref outside the lesson points at the whole lesson. */
function toBlockRef(
  blockRef: string | null | undefined,
  content: LessonContent,
): string {
  const match = blockRef ? BLOCK_REF_PATTERN.exec(blockRef) : null;
  if (!match) {
    return LESSON_BLOCK_REF;
  }
  const blockIndex = Number(match[1]);
  const block = content.blocks[blockIndex];
  if (!block) {
    return LESSON_BLOCK_REF;
  }
  if (match[2] === undefined) {
    return `blocks[${blockIndex}]`;
  }
  const hasItem =
    'items' in block && block.items[Number(match[2])] !== undefined;
  return hasItem
    ? `blocks[${blockIndex}].items[${Number(match[2])}]`
    : `blocks[${blockIndex}]`;
}

export function parseLessonVerifierOutput(
  value: unknown,
  content: LessonContent,
): LessonIssue[] {
  const parsed = verifierOutputSchema.safeParse(value);
  if (!parsed.success) {
    throw new ProviderInvalidResponseError(
      'Lesson verifier output did not match {issues:[{code, blockRef, message}]}',
    );
  }
  return parsed.data.issues
    .slice(0, MAX_LESSON_VERIFIER_ISSUES)
    .map((issue) => ({
      code: toVerifierCode(issue.code),
      blockRef: toBlockRef(issue.blockRef, content),
      message: issue.message,
      source: 'verifier',
    }));
}

/**
 * Brief and module outline first (cached, the same parts the writer sends),
 * then the lesson to check and the reference format for issues.
 */
export function buildLessonVerifierUserParts(input: {
  readonly promptInput: ModuleLessonBatchPromptInput;
  readonly taskIndex: number;
  readonly content: LessonContent;
  readonly research: ResearchBrief | null;
}) {
  const { promptInput, taskIndex, content, research } = input;
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
        'Check this lesson. Report each problem as {"issues":[{"code","blockRef","message"}]}, where blockRef is "blocks[i]", "blocks[i].items[j]" or "lesson" for the lesson as a whole. Return {"issues":[]} when there are none.',
      ].join('\n'),
    },
  ];
}

/**
 * One verifier call on a lesson (starter and pro). The verifier preset holds
 * the instructions (title and setup data match the body, a common-mistake
 * example's wrong and fixed output differ, answer keys follow from their
 * input); this sends the context and the lesson and returns the issues it
 * reports. Throws on provider or output errors; the workflow step owns
 * retries.
 */
export async function runLessonVerifier(
  params: {
    readonly tier: SubscriptionTier;
    readonly planId: string;
    /** The Pro verifier pick; the route ignores it on other tiers. */
    readonly pickedModelId: string | null;
    readonly promptInput: ModuleLessonBatchPromptInput;
    readonly taskIndex: number;
    readonly content: LessonContent;
    readonly research: ResearchBrief | null;
    readonly signal?: AbortSignal;
    readonly timeoutMs?: number;
  },
  deps: LessonQualityCallDeps = {},
): Promise<LessonVerifierRun> {
  const models = getGroundedModelRoute(
    params.tier,
    'lesson_verify',
    params.pickedModelId,
  );
  if (!models) {
    throw new Error(`Lesson verifier is not available for ${params.tier}`);
  }
  const { value, usage, model } = await sendLessonQualityCall(
    {
      tier: params.tier,
      planId: params.planId,
      models,
      presetSlug: GROUNDED_PRESET_BY_OPERATION.lesson_verify.slug,
      stage: LESSON_VERIFY_STAGE,
      userParts: buildLessonVerifierUserParts(params),
      signal: params.signal,
      timeoutMs: params.timeoutMs,
    },
    deps,
  );
  const issues = await withBilledUsage(
    async () => usage,
    async () => parseLessonVerifierOutput(value, params.content),
  );
  return { issues, model, usage };
}
