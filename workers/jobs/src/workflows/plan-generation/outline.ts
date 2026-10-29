import type { ResearchLogFields } from './research';
import type { GeneratedModule } from '@/features/plans/lifecycle/types';
import type { OutlineIssue } from '@/features/plans/outline/checks';
import type { OutlinePurpose } from '@/features/plans/outline/grounded-writer';
import type { ResearchBrief } from '@/features/plans/research/contract';
import type { DbClient } from '@/lib/db/types';
import type { GenerationInput } from '@/shared/types/ai-provider.types';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';
import type { WorkflowStep } from 'cloudflare:workers';

import { resolveTimeoutConfig } from '@/features/ai/orchestrator/timeout-lifecycle';
import { runOutlineCodeChecks } from '@/features/plans/outline/checks';
import { toOutlineQualityRecords } from '@/features/plans/outline/quality-issues';
import { runOutlineRepair } from '@/features/plans/outline/repair';
import {
  isOutlineVerifierAvailable,
  runOutlineVerifier,
} from '@/features/plans/outline/verifier';
import {
  insertGenerationQualityIssues,
  listGenerationQualityIssuesForPlan,
} from '@/lib/db/queries/generation-quality-issues';
import { recordDiscardedCallUsage } from '@/lib/db/queries/plan-ai-budget';

/** Step names are final once deployed (see `PLAN_GENERATION_STEPS`). */
export const OUTLINE_STEPS = {
  verify: 'outline-verify',
  repair: 'outline-repair',
  reverify: 'outline-reverify',
  qualitySave: 'outline-quality-save',
} as const;

export type OutlineStepName =
  (typeof OUTLINE_STEPS)[keyof typeof OUTLINE_STEPS];

const OUTLINE_STEP_TIMEOUT_MARGIN_MS = 60_000;

function outlineCallTimeout(): number {
  const timeout = resolveTimeoutConfig();
  return timeout.baseMs + timeout.extensionMs + OUTLINE_STEP_TIMEOUT_MARGIN_MS;
}

/** One retry; a verifier that still fails leaves the code checks on their own. */
export function verifyStepConfig() {
  return {
    retries: { limit: 1, delay: '10 seconds', backoff: 'exponential' },
    timeout: outlineCallTimeout(),
  } as const;
}

/** Never retried: the one repair pass. A failed repair keeps the first outline. */
export function repairStepConfig() {
  return {
    retries: { limit: 0, delay: 0 },
    timeout: outlineCallTimeout(),
  } as const;
}

/** DB-only; a retry first checks whether its insert landed. */
export const QUALITY_SAVE_STEP_CONFIG = {
  retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
} as const;

export type OutlineLogFields = ResearchLogFields & {
  readonly issueCount?: number;
};

export type OutlineStepsContext = {
  readonly planId: string;
  /** Owner of the plan, for usage of calls whose output was discarded. */
  readonly userId: string;
  readonly tier: SubscriptionTier;
  readonly purpose: OutlinePurpose;
  readonly modelOverride: string | null;
  readonly input: GenerationInput;
  readonly research: ResearchBrief | null;
  /** Quality rows for the plan created from here on belong to this attempt. */
  readonly attemptStartedAt: string;
  readonly withDb: <T>(fn: (db: DbClient) => Promise<T>) => Promise<T>;
  readonly log: (
    step: OutlineStepName,
    fields: OutlineLogFields,
    level?: 'info' | 'warn',
  ) => void;
};

function errorKind(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}

/**
 * A quality call's step result. Steps cached before JCS-170 returned the
 * bare value, without usage.
 */
type OutlineCallResult<T> = {
  readonly value: T;
  readonly usage: CanonicalAIUsage | null;
};

function fromCachedStep<T extends unknown[]>(
  cached: T | { readonly value: T; readonly usage: CanonicalAIUsage },
): OutlineCallResult<T> {
  return Array.isArray(cached) ? { value: cached, usage: null } : cached;
}

/** Verifier issues for `modules`, or `null` when the verifier failed. */
async function verifyOutline(
  step: Pick<WorkflowStep, 'do'>,
  ctx: OutlineStepsContext,
  name: typeof OUTLINE_STEPS.verify | typeof OUTLINE_STEPS.reverify,
  modules: readonly GeneratedModule[],
): Promise<OutlineCallResult<OutlineIssue[]> | null> {
  try {
    // withDb: usage pricing and output ceilings read the synced model catalog.
    const cached = await step.do(name, verifyStepConfig(), async () =>
      ctx.withDb(async (db) => {
        const run = await runOutlineVerifier({
          tier: ctx.tier,
          input: ctx.input,
          modules,
          research: ctx.research,
        }).catch(async (error: unknown) => {
          await recordDiscardedCallUsage(error, ctx, db);
          throw error;
        });
        ctx.log(name, {
          outcome: 'verified',
          model: run.model,
          issueCount: run.issues.length,
        });
        return { value: run.issues, usage: run.usage };
      }),
    );
    return fromCachedStep<OutlineIssue[]>(cached);
  } catch (error) {
    ctx.log(
      name,
      { outcome: 'failed_skipped', errorKind: errorKind(error), err: error },
      'warn',
    );
    return null;
  }
}

/** The repaired outline, or `null` when the repair failed. */
async function repairOutline(
  step: Pick<WorkflowStep, 'do'>,
  ctx: OutlineStepsContext,
  modules: readonly GeneratedModule[],
  issues: readonly OutlineIssue[],
): Promise<OutlineCallResult<GeneratedModule[]> | null> {
  try {
    const cached = await step.do(
      OUTLINE_STEPS.repair,
      repairStepConfig(),
      async () =>
        ctx.withDb(async (db) => {
          const run = await runOutlineRepair({
            tier: ctx.tier,
            purpose: ctx.purpose,
            modelOverride: ctx.modelOverride,
            input: ctx.input,
            modules,
            issues,
            research: ctx.research,
          }).catch(async (error: unknown) => {
            await recordDiscardedCallUsage(error, ctx, db);
            throw error;
          });
          ctx.log(OUTLINE_STEPS.repair, {
            outcome: 'repaired',
            model: run.model,
            issueCount: issues.length,
          });
          return { value: run.modules, usage: run.usage };
        }),
    );
    return fromCachedStep<GeneratedModule[]>(cached);
  } catch (error) {
    ctx.log(
      OUTLINE_STEPS.repair,
      { outcome: 'failed_skipped', errorKind: errorKind(error), err: error },
      'warn',
    );
    return null;
  }
}

async function saveQualityStep(
  db: DbClient,
  ctx: OutlineStepsContext,
  records: ReturnType<typeof toOutlineQualityRecords>,
  attempt: number,
): Promise<{ readonly outcome: string }> {
  if (attempt > 1) {
    const since = new Date(ctx.attemptStartedAt);
    const existing = await listGenerationQualityIssuesForPlan(ctx.planId, db);
    if (
      existing.some((row) => row.stage === 'outline' && row.createdAt >= since)
    ) {
      ctx.log(OUTLINE_STEPS.qualitySave, { outcome: 'already_saved' });
      return { outcome: 'already_saved' };
    }
  }
  await insertGenerationQualityIssues(records, db);
  ctx.log(OUTLINE_STEPS.qualitySave, {
    outcome: 'saved',
    issueCount: records.length,
  });
  return { outcome: 'saved' };
}

/**
 * Outline quality for a grounded run, after `generate`: code checks on all
 * tiers, the verifier on tiers whose policy has one, then one repair pass
 * when anything was found, checked again the same way. The repair is kept
 * only when it has no more issues than the first outline, counting verifier
 * issues only when both verifier runs succeeded. Issues are written to
 * `generation_quality_issues` (remaining and resolved) for the outline kept.
 * Returns that outline: the repaired one, or the first when no repair ran, it
 * failed or it was worse, with the usage of every verifier and repair call
 * (JCS-170), so finalize records it with the outline's own.
 *
 * Code checks are pure and run outside steps on step results, so a replay
 * gets the same answer.
 */
export type OutlineQualityResult = {
  readonly modules: GeneratedModule[];
  /** Verifier and repair calls, in call order. */
  readonly usages: readonly CanonicalAIUsage[];
};

export async function runOutlineQualitySteps(
  step: Pick<WorkflowStep, 'do'>,
  ctx: OutlineStepsContext,
  modules: GeneratedModule[],
): Promise<OutlineQualityResult> {
  const withVerifier = isOutlineVerifierAvailable(ctx.tier);
  const usages: CanonicalAIUsage[] = [];
  const valueOf = <T>(result: OutlineCallResult<T> | null): T | null => {
    if (result?.usage) {
      usages.push(result.usage);
    }
    return result?.value ?? null;
  };

  const verifierIssues = withVerifier
    ? valueOf(await verifyOutline(step, ctx, OUTLINE_STEPS.verify, modules))
    : null;
  const codeIssues = runOutlineCodeChecks(modules, ctx.input);
  const pass0 = [...codeIssues, ...(verifierIssues ?? [])];
  if (pass0.length === 0) {
    return { modules, usages };
  }

  const repaired = valueOf(await repairOutline(step, ctx, modules, pass0));
  let kept = modules;
  let pass1: Parameters<typeof toOutlineQualityRecords>[1]['pass1'] = null;
  if (repaired) {
    const reverified = withVerifier
      ? valueOf(
          await verifyOutline(step, ctx, OUTLINE_STEPS.reverify, repaired),
        )
      : null;
    const repairedCodeIssues = runOutlineCodeChecks(repaired, ctx.input);
    const compareVerifier = verifierIssues !== null && reverified !== null;
    const before =
      codeIssues.length + (compareVerifier ? verifierIssues.length : 0);
    const after =
      repairedCodeIssues.length + (compareVerifier ? reverified.length : 0);
    if (after <= before) {
      kept = repaired;
      pass1 = {
        issues: [...repairedCodeIssues, ...(reverified ?? [])],
        verifierRan: reverified !== null,
      };
    } else {
      ctx.log(
        OUTLINE_STEPS.repair,
        { outcome: 'repair_rejected', issueCount: after },
        'warn',
      );
    }
  }

  const records = toOutlineQualityRecords(ctx.planId, { pass0, pass1 });
  await step.do(
    OUTLINE_STEPS.qualitySave,
    QUALITY_SAVE_STEP_CONFIG,
    async (stepCtx) =>
      ctx.withDb((db) => saveQualityStep(db, ctx, records, stepCtx.attempt)),
  );
  return { modules: kept, usages };
}
