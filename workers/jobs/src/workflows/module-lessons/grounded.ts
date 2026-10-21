import type { GroundedLesson } from '@/features/lesson-content/grounded-lesson-writer';
import type {
  ModuleLessonBatchPromptInput,
  ModuleLessonBatchPromptTask,
} from '@/features/lesson-content/module-lesson-prompts';
import type { ModuleLessonGenerationTarget } from '@/features/lesson-content/run-module-lesson-generation-work';
import type { ResearchBrief } from '@/features/plans/research/contract';
import type { DbClient } from '@/lib/db/types';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';
import type { WorkflowStep, WorkflowStepConfig } from 'cloudflare:workers';

import { resolveOverrideOrSavedModelId } from '@/features/ai/model-preferences';
import { resolveTimeoutConfig } from '@/features/ai/orchestrator/timeout-lifecycle';
import { ParserError } from '@/features/ai/parser';
import { resolveUserTier } from '@/features/billing/tier';
import { buildGroundedLessonPromptParts } from '@/features/lesson-content/grounded-lesson-prompt';
import {
  groundedLessonModels,
  parseGroundedLessonText,
  toLessonResearch,
  writeGroundedLesson,
} from '@/features/lesson-content/grounded-lesson-writer';
import {
  markModuleLessonProviderStarted,
  revertModuleLessonGeneratingToNotGenerated,
} from '@/lib/db/queries/module-lesson-generation';
import { getLatestPlanResearch } from '@/lib/db/queries/plan-research';
import { getUserPreferences } from '@/lib/db/queries/user-preferences';

/**
 * Per-lesson step names, numbered by the lesson's position in the claimed
 * task list. Final once deployed, like `MODULE_LESSONS_STEPS`.
 */
export type GroundedLessonStepName =
  | `lesson-${number}`
  | `lesson-${number}-retry`;

export function groundedLessonStepName(
  position: number,
  attempt: 1 | 2,
): GroundedLessonStepName {
  return attempt === 1 ? `lesson-${position}` : `lesson-${position}-retry`;
}

/**
 * Lesson calls in flight at once per module. Free models share a low
 * per-minute rate limit, so the free tier runs two.
 */
export const GROUNDED_LESSON_FAN_OUT_BY_TIER = {
  free: 2,
  starter: 4,
  pro: 6,
} as const satisfies Record<SubscriptionTier, number>;

/** Parse failures a second call can fix, as in the batch path. */
const RETRYABLE_PARSE_ERROR_KINDS: ReadonlySet<string> = new Set([
  'invalid_json',
  'validation',
]);

const PARSE_ERROR_MESSAGE_MAX_CHARS = 1_000;

/** Decided in the `claim` step; JSON-safe so it replays with the claim. */
export type GroundedLessonContext = {
  readonly tier: SubscriptionTier;
  /** The override or saved lesson model; the route ignores non-catalog picks. */
  readonly pickedModelId: string | null;
  readonly research: ResearchBrief | null;
};

/**
 * The grounded lesson context when `tier`'s grounded switch is on, else
 * `null` (the batch path). Reads the current tier like the batch provider.
 */
export async function resolveGroundedLessonContext(
  db: DbClient,
  input: {
    readonly target: ModuleLessonGenerationTarget;
    readonly modelOverride?: string | null;
    readonly isGroundedEnabled: (tier: SubscriptionTier) => boolean;
  },
): Promise<GroundedLessonContext | null> {
  const tier = await resolveUserTier(input.target.userId, db);
  if (!input.isGroundedEnabled(tier)) {
    return null;
  }
  const [saved, latest] = await Promise.all([
    getUserPreferences(input.target.userId, db),
    getLatestPlanResearch(input.target.planId, db),
  ]);
  return {
    tier,
    pickedModelId:
      resolveOverrideOrSavedModelId(
        input.modelOverride,
        tier,
        saved,
        'lesson',
      ) ?? null,
    research: toLessonResearch(latest),
  };
}

export type GroundedLessonLogFields = {
  readonly lesson: number;
  readonly attempt: 1 | 2;
  readonly outcome: string;
  readonly rawChars?: number;
  readonly finishReason?: string;
  readonly errorKind?: string;
  readonly errorMessage?: string;
};

export type GroundedLessonStepsContext = {
  readonly target: ModuleLessonGenerationTarget;
  readonly promptInput: ModuleLessonBatchPromptInput;
  readonly grounded: GroundedLessonContext;
  readonly generateStepConfig: WorkflowStepConfig;
  readonly isEnabled: () => boolean;
  readonly withDb: <T>(fn: (db: DbClient) => Promise<T>) => Promise<T>;
  /** Releases the claim when the switch drops mid-run. */
  readonly revertArgs: Parameters<
    typeof revertModuleLessonGeneratingToNotGenerated
  >[1];
  readonly nonRetryable: (message: string) => Error;
  readonly now: () => Date;
  readonly log: (
    step: GroundedLessonStepName,
    fields: GroundedLessonLogFields,
    level?: 'info' | 'warn',
  ) => void;
};

type LessonStepResult =
  | {
      readonly kind: 'written';
      readonly lesson: GroundedLesson;
      readonly usage: CanonicalAIUsage;
    }
  | {
      readonly kind: 'parse_failed';
      readonly errorKind: string;
      readonly errorMessage: string;
      readonly retryable: boolean;
    }
  | { readonly kind: 'disabled' };

export type GroundedLessonsResult =
  | {
      readonly kind: 'written';
      /** In task order. */
      readonly lessons: readonly GroundedLesson[];
      readonly usages: readonly [CanonicalAIUsage, ...CanonicalAIUsage[]];
    }
  | { readonly kind: 'disabled' };

/**
 * One lesson call and its parse. The provider-start marker is a no-op after
 * the module's first call, so usage quota counts the module once.
 */
async function lessonStep(
  db: DbClient,
  ctx: GroundedLessonStepsContext,
  index: number,
  attempt: 1 | 2,
): Promise<LessonStepResult> {
  const position = index + 1;
  const name = groundedLessonStepName(position, attempt);
  const task: ModuleLessonBatchPromptTask | undefined =
    ctx.promptInput.tasks[index];
  if (!task) {
    throw new RangeError(`No lesson task at index ${index}`);
  }
  if (!ctx.isEnabled()) {
    await revertModuleLessonGeneratingToNotGenerated(db, ctx.revertArgs);
    ctx.log(name, { lesson: position, attempt, outcome: 'disabled' });
    return { kind: 'disabled' };
  }

  await markModuleLessonProviderStarted(db, {
    ...ctx.target,
    providerStartedAt: ctx.now().toISOString(),
  });
  const raw = await writeGroundedLesson({
    tier: ctx.grounded.tier,
    planId: ctx.target.planId,
    models: groundedLessonModels(ctx.grounded.tier, ctx.grounded.pickedModelId),
    userParts: buildGroundedLessonPromptParts({
      promptInput: ctx.promptInput,
      taskIndex: index,
      research: ctx.grounded.research,
    }),
    timeoutMs: resolveTimeoutConfig().baseMs,
  });
  const logged = {
    lesson: position,
    attempt,
    rawChars: raw.rawText.length,
    finishReason: raw.finishReason,
  };

  try {
    const lesson = parseGroundedLessonText(
      raw.rawText,
      task.taskId,
      ctx.grounded.research,
    );
    ctx.log(name, { ...logged, outcome: 'written' });
    return { kind: 'written', lesson, usage: raw.usage };
  } catch (error) {
    if (!(error instanceof ParserError)) {
      throw error;
    }
    // The message names the failing check or schema path, never the text.
    const errorMessage = error.message.slice(0, PARSE_ERROR_MESSAGE_MAX_CHARS);
    ctx.log(
      name,
      {
        ...logged,
        outcome: 'parse_failed',
        errorKind: error.kind,
        errorMessage,
      },
      'warn',
    );
    return {
      kind: 'parse_failed',
      errorKind: error.kind,
      errorMessage,
      retryable: RETRYABLE_PARSE_ERROR_KINDS.has(error.kind),
    };
  }
}

/** `lesson-<n>`, then `lesson-<n>-retry` once after a retryable parse failure. */
async function writeLessonWithRetry(
  step: Pick<WorkflowStep, 'do'>,
  ctx: GroundedLessonStepsContext,
  index: number,
): Promise<Exclude<LessonStepResult, { kind: 'parse_failed' }>> {
  const position = index + 1;
  const first = await step.do(
    groundedLessonStepName(position, 1),
    ctx.generateStepConfig,
    async () => ctx.withDb((db) => lessonStep(db, ctx, index, 1)),
  );
  if (first.kind !== 'parse_failed') {
    return first;
  }
  if (!first.retryable) {
    throw ctx.nonRetryable(
      `Lesson ${position} could not be parsed (${first.errorKind}): ${first.errorMessage}`,
    );
  }
  const second = await step.do(
    groundedLessonStepName(position, 2),
    ctx.generateStepConfig,
    async () => ctx.withDb((db) => lessonStep(db, ctx, index, 2)),
  );
  if (second.kind === 'parse_failed') {
    throw ctx.nonRetryable(
      `Lesson ${position} could not be parsed (${second.errorKind}): ${second.errorMessage}`,
    );
  }
  return second;
}

/**
 * Runs `fn` over `items` with at most `limit` in flight, results in input
 * order. After a failure it starts nothing new, waits for the calls in
 * flight, then throws the first error, so no step outlives the run.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  let failure: { error: unknown } | null = null;
  const worker = async () => {
    while (failure === null && next < items.length) {
      const index = next;
      next += 1;
      try {
        results[index] = await fn(items[index] as T, index);
      } catch (error) {
        failure ??= { error };
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  if (failure !== null) {
    throw (failure as { error: unknown }).error;
  }
  return results;
}

/**
 * One call per lesson, all of the module's lessons in parallel up to the
 * tier's fan-out, each with its own parse retry. Throws when a lesson still
 * fails after its retry or a call throws; the caller runs `fail`.
 */
export async function runGroundedLessonSteps(
  step: Pick<WorkflowStep, 'do'>,
  ctx: GroundedLessonStepsContext,
): Promise<GroundedLessonsResult> {
  const results = await mapWithConcurrency(
    ctx.promptInput.tasks,
    GROUNDED_LESSON_FAN_OUT_BY_TIER[ctx.grounded.tier],
    (_task, index) => writeLessonWithRetry(step, ctx, index),
  );
  const written = results.filter((result) => result.kind === 'written');
  const [first, ...rest] = written.map((result) => result.usage);
  if (written.length !== results.length || !first) {
    return { kind: 'disabled' };
  }
  return {
    kind: 'written',
    lessons: written.map((result) => result.lesson),
    usages: [first, ...rest],
  };
}
