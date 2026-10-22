import type { GroundedLessonContext } from './grounded';
import type { LessonIssue } from '@/features/lesson-content/lesson-citation-checks';
import type { LessonQualityPass } from '@/features/lesson-content/lesson-quality-issues';
import type { ModuleLessonBatchPromptInput } from '@/features/lesson-content/module-lesson-prompts';
import type { ModuleLessonGenerationTarget } from '@/features/lesson-content/run-module-lesson-generation-work';
import type { NewGenerationBudgetCut } from '@/lib/db/queries/types/generation-budget-cuts.types';
import type { NewGenerationQualityIssue } from '@/lib/db/queries/types/generation-quality-issues.types';
import type { DbClient } from '@/lib/db/types';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';
import type { LessonContent } from '@/shared/types/lesson-content.types';
import type { WorkflowStep } from 'cloudflare:workers';

import {
  QUALITY_SAVE_STEP_CONFIG,
  repairStepConfig,
  verifyStepConfig,
} from '../plan-generation/outline';
import { resolveTimeoutConfig } from '@/features/ai/orchestrator/timeout-lifecycle';
import {
  isNearPlanAiCeiling,
  usageCostMicrousd,
} from '@/features/billing/plan-ai-budget';
import {
  SCHEMA_INVALID_CODE,
  runLessonCodeChecks,
} from '@/features/lesson-content/lesson-checks';
import { toLessonQualityRecords } from '@/features/lesson-content/lesson-quality-issues';
import {
  LESSON_REPAIR_PASSES,
  lessonAdvisorTool,
  runLessonRepair,
} from '@/features/lesson-content/lesson-repair';
import {
  isLessonVerifierAvailable,
  runLessonVerifier,
} from '@/features/lesson-content/lesson-verifier';
import {
  insertGenerationQualityIssues,
  listGenerationQualityIssuesForPlan,
} from '@/lib/db/queries/generation-quality-issues';
import {
  countGenerationBudgetCutsForModule,
  insertGenerationBudgetCuts,
} from '@/lib/db/queries/plan-ai-budget';

/** Step names are final once deployed, like `MODULE_LESSONS_STEPS`. */
export type LessonQualityStepName =
  | `lesson-${number}-verify-${number}`
  | `lesson-${number}-repair-${number}`
  | typeof LESSONS_QUALITY_SAVE_STEP;

export const LESSONS_QUALITY_SAVE_STEP = 'lessons-quality-save';

export function lessonVerifyStepName(
  position: number,
  pass: number,
): LessonQualityStepName {
  return `lesson-${position}-verify-${pass}`;
}

export function lessonRepairStepName(
  position: number,
  pass: number,
): LessonQualityStepName {
  return `lesson-${position}-repair-${pass}`;
}

export type LessonQualityLogFields = {
  readonly lesson?: number;
  readonly pass?: number;
  readonly outcome: string;
  readonly model?: string;
  readonly advisor?: boolean;
  readonly issueCount?: number;
  readonly cutCount?: number;
  readonly spentMicrousd?: number;
  readonly ceilingMicrousd?: number;
  readonly errorKind?: string;
  readonly err?: unknown;
};

export type LessonQualityContext = {
  readonly target: ModuleLessonGenerationTarget;
  readonly promptInput: ModuleLessonBatchPromptInput;
  readonly grounded: GroundedLessonContext;
  /** Quality rows for the module created from here on belong to this run. */
  readonly attemptStartedAt: string;
  readonly withDb: <T>(fn: (db: DbClient) => Promise<T>) => Promise<T>;
  readonly log: (
    step: LessonQualityStepName,
    fields: LessonQualityLogFields,
    level?: 'info' | 'warn',
  ) => void;
};

export type LessonQualityResult = {
  /** The lesson to ship: the last repair kept, or the written lesson. */
  readonly content: LessonContent;
  /** Verifier and repair calls, in call order. */
  readonly usages: readonly CanonicalAIUsage[];
  readonly records: readonly NewGenerationQualityIssue[];
  /** Repair passes or advisors the plan's AI ceiling cut (JCS-170). */
  readonly cuts: readonly NewGenerationBudgetCut[];
};

type CallResult<T> =
  | { readonly kind: 'ok'; readonly value: T; readonly usage: CanonicalAIUsage }
  | { readonly kind: 'failed' };

function errorKind(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}

/** The lesson calls' own timeout: the adaptive base plus one extension. */
function qualityCallTimeoutMs(): number {
  const timeout = resolveTimeoutConfig();
  return timeout.baseMs + timeout.extensionMs;
}

async function verifyLesson(
  step: Pick<WorkflowStep, 'do'>,
  ctx: LessonQualityContext,
  index: number,
  pass: number,
  content: LessonContent,
): Promise<CallResult<LessonIssue[]>> {
  const position = index + 1;
  const name = lessonVerifyStepName(position, pass);
  try {
    return await step.do(name, verifyStepConfig(), async () => {
      const run = await runLessonVerifier({
        tier: ctx.grounded.tier,
        planId: ctx.target.planId,
        pickedModelId: ctx.grounded.verifierModelId,
        promptInput: ctx.promptInput,
        taskIndex: index,
        content,
        research: ctx.grounded.research,
        timeoutMs: qualityCallTimeoutMs(),
      });
      ctx.log(name, {
        lesson: position,
        pass,
        outcome: 'verified',
        model: run.model,
        issueCount: run.issues.length,
      });
      return { kind: 'ok', value: run.issues, usage: run.usage } as const;
    });
  } catch (error) {
    ctx.log(
      name,
      {
        lesson: position,
        pass,
        outcome: 'failed_skipped',
        errorKind: errorKind(error),
        err: error,
      },
      'warn',
    );
    return { kind: 'failed' };
  }
}

async function repairLesson(
  step: Pick<WorkflowStep, 'do'>,
  ctx: LessonQualityContext,
  index: number,
  pass: number,
  content: LessonContent,
  issues: readonly LessonIssue[],
  withAdvisor: boolean,
): Promise<CallResult<LessonContent>> {
  const position = index + 1;
  const name = lessonRepairStepName(position, pass);
  try {
    return await step.do(name, repairStepConfig(), async () => {
      const run = await runLessonRepair({
        tier: ctx.grounded.tier,
        planId: ctx.target.planId,
        pickedModelId: ctx.grounded.pickedModelId,
        advisorModelId: ctx.grounded.advisorModelId,
        withAdvisor,
        promptInput: ctx.promptInput,
        taskIndex: index,
        content,
        issues,
        research: ctx.grounded.research,
        timeoutMs: qualityCallTimeoutMs(),
      });
      ctx.log(name, {
        lesson: position,
        pass,
        outcome: 'repaired',
        model: run.model,
        advisor: run.advisor,
        issueCount: issues.length,
      });
      return { kind: 'ok', value: run.content, usage: run.usage } as const;
    });
  } catch (error) {
    ctx.log(
      name,
      {
        lesson: position,
        pass,
        outcome: 'failed_skipped',
        errorKind: errorKind(error),
        err: error,
      },
      'warn',
    );
    return { kind: 'failed' };
  }
}

/**
 * Quality for one written grounded lesson: code checks on every tier, the
 * verifier on tiers whose policy has one, then up to `LESSON_REPAIR_PASSES`
 * repairs while issues remain, each checked again the same way. A repair is
 * kept only when it passes the block contract and has no more issues than
 * the lesson it replaced, counting verifier issues only when the verifier
 * ran on both. A failed repair or verifier call is logged and skipped; it
 * still uses up its pass.
 *
 * Near the plan's AI ceiling (JCS-170) the first repair runs without the
 * advisor and later passes are skipped; the verifier and first repair are
 * required. Spend counts the claim's snapshot plus this lesson's own calls,
 * not its siblings' in flight.
 *
 * Code checks and the ceiling gate are pure and run outside steps on step
 * results, so a replay gets the same answer.
 */
export async function runLessonQualitySteps(
  step: Pick<WorkflowStep, 'do'>,
  ctx: LessonQualityContext,
  index: number,
  written: LessonContent,
  writerUsage: CanonicalAIUsage,
): Promise<LessonQualityResult> {
  const task = ctx.promptInput.tasks[index];
  if (!task) {
    throw new RangeError(`No lesson task at index ${index}`);
  }
  const withVerifier = isLessonVerifierAvailable(ctx.grounded.tier);
  const usages: CanonicalAIUsage[] = [];
  const cuts: NewGenerationBudgetCut[] = [];
  const { budget } = ctx.grounded;
  const hasAdvisor =
    lessonAdvisorTool(ctx.grounded.tier, ctx.grounded.advisorModelId) !== null;
  const spentMicrousd = () =>
    Math.round(
      (budget?.spentMicrousd ?? 0) +
        [writerUsage, ...usages].reduce(
          (sum, usage) => sum + usageCostMicrousd(usage),
          0,
        ),
    );
  const nearCeiling = () =>
    budget !== undefined && isNearPlanAiCeiling(budget, spentMicrousd());
  const cut = (cutStep: NewGenerationBudgetCut['step'], pass: number) => {
    if (!budget) {
      return;
    }
    const spent = spentMicrousd();
    cuts.push({
      planId: ctx.target.planId,
      moduleId: ctx.target.moduleId,
      taskId: task.taskId,
      step: cutStep,
      pass,
      spentMicrousd: spent,
      ceilingMicrousd: budget.ceilingMicrousd,
    });
    ctx.log(lessonRepairStepName(index + 1, pass), {
      lesson: index + 1,
      pass,
      outcome: cutStep === 'repair' ? 'budget_skipped' : 'advisor_budget_cut',
      spentMicrousd: spent,
      ceilingMicrousd: budget.ceilingMicrousd,
    });
  };
  const check = async (pass: number, content: LessonContent) => {
    const codeIssues = runLessonCodeChecks(content, {
      estimatedMinutes: task.estimatedMinutes,
      research: ctx.grounded.research,
    });
    // A lesson that breaks the block contract is rejected without a verifier call.
    const schemaBroken = codeIssues.some(
      (issue) => issue.code === SCHEMA_INVALID_CODE,
    );
    const verified =
      withVerifier && !schemaBroken
        ? await verifyLesson(step, ctx, index, pass, content)
        : null;
    if (verified?.kind === 'ok') {
      usages.push(verified.usage);
    }
    const verifierIssues = verified?.kind === 'ok' ? verified.value : null;
    return {
      pass,
      codeIssues,
      verifierIssues,
      issues: [...codeIssues, ...(verifierIssues ?? [])],
      verifierRan: verifierIssues !== null,
      schemaBroken,
    };
  };

  let content = written;
  let current = await check(0, content);
  const passes: LessonQualityPass[] = [current];

  for (
    let pass = 1;
    pass <= LESSON_REPAIR_PASSES && current.issues.length > 0;
    pass += 1
  ) {
    const near = nearCeiling();
    if (near && pass > 1) {
      cut('repair', pass);
      break;
    }
    if (near && hasAdvisor) {
      cut('advisor', pass);
    }
    const repaired = await repairLesson(
      step,
      ctx,
      index,
      pass,
      content,
      current.issues,
      hasAdvisor && !near,
    );
    if (repaired.kind !== 'ok') {
      continue;
    }
    usages.push(repaired.usage);
    const next = await check(pass, repaired.value);
    const compareVerifier = current.verifierRan && next.verifierRan;
    const count = (checked: typeof current) =>
      checked.codeIssues.length +
      (compareVerifier ? (checked.verifierIssues?.length ?? 0) : 0);
    if (next.schemaBroken || count(next) > count(current)) {
      ctx.log(
        lessonRepairStepName(index + 1, pass),
        {
          lesson: index + 1,
          pass,
          outcome: 'repair_rejected',
          issueCount: next.issues.length,
        },
        'warn',
      );
      continue;
    }
    content = repaired.value;
    current = next;
    passes.push(current);
  }

  return {
    content,
    usages,
    cuts,
    records: toLessonQualityRecords(
      {
        planId: ctx.target.planId,
        moduleId: ctx.target.moduleId,
        taskId: task.taskId,
      },
      passes,
    ),
  };
}

async function saveQualityStep(
  db: DbClient,
  ctx: LessonQualityContext,
  records: NewGenerationQualityIssue[],
  cuts: NewGenerationBudgetCut[],
  attempt: number,
): Promise<{ readonly outcome: string }> {
  if (attempt > 1) {
    const since = new Date(ctx.attemptStartedAt);
    const [existing, existingCuts] = await Promise.all([
      listGenerationQualityIssuesForPlan(ctx.target.planId, db),
      countGenerationBudgetCutsForModule(
        ctx.target.planId,
        ctx.target.moduleId,
        db,
        since,
      ),
    ]);
    if (
      existingCuts > 0 ||
      existing.some(
        (row) =>
          row.stage === 'lesson' &&
          row.moduleId === ctx.target.moduleId &&
          row.createdAt >= since,
      )
    ) {
      ctx.log(LESSONS_QUALITY_SAVE_STEP, { outcome: 'already_saved' });
      return { outcome: 'already_saved' };
    }
  }
  await db.transaction(async (tx) => {
    await insertGenerationQualityIssues(records, tx);
    await insertGenerationBudgetCuts(cuts, tx);
  });
  ctx.log(LESSONS_QUALITY_SAVE_STEP, {
    outcome: 'saved',
    issueCount: records.length,
    cutCount: cuts.length,
  });
  return { outcome: 'saved' };
}

/**
 * Writes the module's lesson issues (resolved and remaining) to
 * `generation_quality_issues` and the steps its plan's AI ceiling cut to
 * `generation_budget_cuts`, in one transaction. Skipped when there are none.
 */
export async function saveLessonQualityIssues(
  step: Pick<WorkflowStep, 'do'>,
  ctx: LessonQualityContext,
  records: NewGenerationQualityIssue[],
  cuts: NewGenerationBudgetCut[],
): Promise<void> {
  if (records.length === 0 && cuts.length === 0) {
    return;
  }
  await step.do(
    LESSONS_QUALITY_SAVE_STEP,
    QUALITY_SAVE_STEP_CONFIG,
    async (stepCtx) =>
      ctx.withDb((db) =>
        saveQualityStep(db, ctx, records, cuts, stepCtx.attempt),
      ),
  );
}
