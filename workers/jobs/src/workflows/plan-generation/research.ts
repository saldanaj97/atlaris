import type { ResearchMode } from '@/features/ai/model-operation-policy';
import type { ResearchBrief } from '@/features/plans/research/contract';
import type { DbClient } from '@/lib/db/types';
import type { GenerationInput } from '@/shared/types/ai-provider.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';
import type { WorkflowStep } from 'cloudflare:workers';

import { resolveTimeoutConfig } from '@/features/ai/orchestrator/timeout-lifecycle';
import {
  researchModeForTier,
  runPlanResearch,
} from '@/features/plans/research/run-research';
import { recordDiscardedCallUsage } from '@/lib/db/queries/plan-ai-budget';
import {
  getLatestPlanResearch,
  insertPlanResearch,
} from '@/lib/db/queries/plan-research';

/** Step names are final once deployed (see `PLAN_GENERATION_STEPS`). */
export const RESEARCH_STEPS = {
  research: 'research',
  researchSave: 'research-save',
} as const;

export type ResearchStepName =
  (typeof RESEARCH_STEPS)[keyof typeof RESEARCH_STEPS];

const RESEARCH_STEP_TIMEOUT_MARGIN_MS = 60_000;

/**
 * Two retries, then the run continues without research. Gateway retries are
 * off for server-tool calls, so these are the only ones.
 */
export function researchStepConfig() {
  const timeout = resolveTimeoutConfig();
  return {
    retries: { limit: 2, delay: '10 seconds', backoff: 'exponential' },
    timeout:
      timeout.baseMs + timeout.extensionMs + RESEARCH_STEP_TIMEOUT_MARGIN_MS,
  } as const;
}

/** DB-only; a retry first checks whether its insert landed. */
export const RESEARCH_SAVE_STEP_CONFIG = {
  retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
} as const;

/** What later stages get: the brief and sources, or nothing when skipped. */
export type PlanResearchOutcome =
  | { readonly status: 'ok'; readonly research: ResearchBrief }
  | { readonly status: 'failed_skipped' };

/** JSON-safe: stored as the `research` step's result. */
type ResearchStepResult = {
  readonly research: ResearchBrief;
  readonly mode: ResearchMode;
  readonly searchCount: number;
  readonly costMicrousd: number | null;
};

export type ResearchLogFields = {
  readonly outcome: string;
  readonly errorKind?: string;
  readonly err?: unknown;
  readonly model?: string;
  readonly sourceCount?: number;
  readonly droppedSourceCount?: number;
  readonly searchCount?: number;
};

export type ResearchStepsContext = {
  readonly planId: string;
  /** Owner of the plan, for usage of research calls whose brief was rejected. */
  readonly userId: string;
  readonly tier: SubscriptionTier;
  readonly input: GenerationInput;
  /** Regeneration feedback that steers the search (JCS-162). */
  readonly guidance?: string | null;
  /** Research rows for the plan created from here on belong to this attempt. */
  readonly attemptStartedAt: string;
  readonly withDb: <T>(fn: (db: DbClient) => Promise<T>) => Promise<T>;
  readonly log: (
    step: ResearchStepName,
    fields: ResearchLogFields,
    level?: 'info' | 'warn',
  ) => void;
};

async function researchStep(
  db: DbClient,
  ctx: ResearchStepsContext,
): Promise<ResearchStepResult> {
  // A rejected attempt is billed but saves no `plan_research` row, so its
  // cost goes to `ai_usage_events`.
  const run = await runPlanResearch({
    tier: ctx.tier,
    input: ctx.input,
    guidance: ctx.guidance,
  }).catch(async (error: unknown) => {
    await recordDiscardedCallUsage(error, ctx, db);
    throw error;
  });
  ctx.log('research', {
    outcome: 'researched',
    model: run.model,
    sourceCount: run.research.sources.length,
    droppedSourceCount: run.droppedSourceCount,
    searchCount: run.searchCount,
  });
  return {
    research: run.research,
    mode: run.mode,
    searchCount: run.searchCount,
    costMicrousd: run.costMicrousd,
  };
}

async function saveResearchStep(
  db: DbClient,
  ctx: ResearchStepsContext,
  researched: ResearchStepResult | null,
  attempt: number,
): Promise<{ readonly outcome: string }> {
  if (attempt > 1) {
    const latest = await getLatestPlanResearch(ctx.planId, db);
    if (latest && latest.research.createdAt >= new Date(ctx.attemptStartedAt)) {
      ctx.log('research-save', { outcome: 'already_saved' });
      return { outcome: 'already_saved' };
    }
  }

  // A skipped run's searches and cost are unknown: 0 and null, no sources.
  await insertPlanResearch(
    researched
      ? {
          research: {
            planId: ctx.planId,
            brief: researched.research.brief,
            mode: researched.mode,
            status: 'ok',
            searchCount: researched.searchCount,
            costMicrousd: researched.costMicrousd,
          },
          sources: researched.research.sources.map((source) => ({
            citationKey: source.key,
            url: source.url,
            title: source.title,
            publisher: source.publisher,
          })),
        }
      : {
          research: {
            planId: ctx.planId,
            brief: '',
            mode: researchModeForTier(ctx.tier),
            status: 'failed_skipped',
            searchCount: 0,
            costMicrousd: null,
          },
          sources: [],
        },
    db,
  );
  const outcome = researched ? 'saved' : 'saved_failed_skipped';
  ctx.log('research-save', { outcome });
  return { outcome };
}

/**
 * Grounded research, once per plan: `research` (two retries) then
 * `research-save`. When research exhausts its retries the run saves
 * `failed_skipped` and continues to the outline with no brief or sources.
 * A save that exhausts its retries throws into the workflow's `fail` path.
 */
export async function runPlanResearchSteps(
  step: Pick<WorkflowStep, 'do'>,
  ctx: ResearchStepsContext,
): Promise<PlanResearchOutcome> {
  let researched: ResearchStepResult | null = null;
  try {
    researched = await step.do(
      RESEARCH_STEPS.research,
      researchStepConfig(),
      // withDb: the call's output ceiling reads the synced model catalog.
      async () => ctx.withDb((db) => researchStep(db, ctx)),
    );
  } catch (error) {
    ctx.log(
      'research',
      {
        outcome: 'failed_skipped',
        errorKind: error instanceof Error ? error.name : 'unknown',
        err: error,
      },
      'warn',
    );
  }

  await step.do(
    RESEARCH_STEPS.researchSave,
    RESEARCH_SAVE_STEP_CONFIG,
    async (stepCtx) =>
      ctx.withDb((db) =>
        saveResearchStep(db, ctx, researched, stepCtx.attempt),
      ),
  );

  return researched
    ? { status: 'ok', research: researched.research }
    : { status: 'failed_skipped' };
}
