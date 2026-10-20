import type { EnqueueModuleLessonGenerationsDeps } from '@/features/lesson-content/progressive-enqueue';
import type { GenerationRunResult } from '@/features/plans/lifecycle/service';
import type {
  GeneratedModule,
  GenerationAttemptResult,
  ProcessGenerationInput,
} from '@/features/plans/lifecycle/types';
import type { PlanGenerationWorkflowInput } from '@/features/plans/workflows/plan-generation.types';
import type {
  AttemptReservation,
  AttemptWorkflowMetadata,
} from '@/lib/db/queries/types/attempts.types';
import type { DbClient } from '@/lib/db/types';
import type { Logger } from '@/lib/logging/logger';
import type { ProviderMetadata } from '@/shared/types/ai-provider.types';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';
import type { FailureClassification } from '@/shared/types/failure-classification.types';
import type { GenerationPurpose } from '@/shared/types/generation-purpose';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

import { resolveTimeoutConfig } from '@/features/ai/orchestrator/timeout-lifecycle';
import { createPlanLifecycleService } from '@/features/plans/lifecycle/factory';
import { validateReservation } from '@/features/plans/lifecycle/generation';
import {
  fromSerializableReservation,
  resolvePlanGenerationWorkflowPurpose,
  toPlanGenerationProcessInput,
} from '@/features/plans/workflows/plan-generation.types';
import { mergeAttemptWorkflowMetadata } from '@/lib/db/queries/attempts';
import {
  type PlanGenerationStartCommand,
  planGenerationStartCommandSchema,
  toPlanGenerationWorkflowInput,
} from '@/lib/jobs-worker/contract';

export const PLAN_GENERATION_JOB = 'plan-generation';

/** Instance params: the signed start command, `v` included. */
export type PlanGenerationWorkflowParams = PlanGenerationStartCommand;

/**
 * Step names are final once deployed: never rename, reorder, or remove them
 * while instances may be in flight (design note, Decision 6).
 */
export const PLAN_GENERATION_STEPS = {
  recordWorkflow: 'record-workflow',
  generate: 'generate',
  finalize: 'finalize',
  fail: 'fail',
} as const;

type StepName =
  (typeof PLAN_GENERATION_STEPS)[keyof typeof PLAN_GENERATION_STEPS];

/** Margin over the AI timeout so the provider abort fires before the step's. */
const GENERATE_STEP_TIMEOUT_MARGIN_MS = 60_000;

const PAUSED_MESSAGE = 'Plan generation is paused on the jobs Worker.';
const WORKFLOW_FAILURE_MESSAGE = 'Plan generation workflow failed.';

/** DB-only and idempotent (a JSON merge): retry transient failures. */
export const RECORD_WORKFLOW_STEP_CONFIG = {
  retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
} as const;

/** Finalize retries cover transient DB errors; a retry first checks for its own commit. */
export const FINALIZE_STEP_CONFIG = {
  retries: { limit: 2, delay: '10 seconds', backoff: 'exponential' },
} as const;

export const FAIL_STEP_CONFIG = {
  retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
} as const;

/**
 * Never retried: an uncertain provider outcome would repeat the OpenRouter
 * call. The timeout covers the adaptive AI timeout (base + one extension).
 */
export function generateStepConfig() {
  const timeout = resolveTimeoutConfig();
  return {
    retries: { limit: 0, delay: 0 },
    timeout:
      timeout.baseMs + timeout.extensionMs + GENERATE_STEP_TIMEOUT_MARGIN_MS,
  } as const;
}

export type PlanGenerationWorkflowOutcome = {
  readonly kind:
    | 'success'
    | 'retryable_failure'
    | 'permanent_failure'
    | 'disabled'
    | 'already_finalized'
    | 'failed';
};

/**
 * JSON-safe `GenerationRunResult` (step results are stored as JSON). The
 * reservation is rebuilt from the params, and the error object is not kept:
 * settlement persists only its classification.
 */
type GenerateStepResult =
  | { readonly kind: 'disabled' }
  | { readonly kind: 'already_finalized' }
  | {
      readonly kind: 'generated';
      readonly modules: GeneratedModule[];
      readonly metadata: ProviderMetadata;
      readonly usage: CanonicalAIUsage;
      readonly durationMs: number;
      readonly extendedTimeout: boolean;
    }
  | {
      readonly kind: 'failed';
      readonly classification: FailureClassification;
      readonly metadata?: ProviderMetadata;
      readonly usage?: CanonicalAIUsage;
      readonly durationMs: number;
      readonly timedOut: boolean;
      readonly extendedTimeout: boolean;
    };

export type PlanGenerationWorkflowDeps = {
  /** `isJobEnabled(env, 'PLAN_GENERATION')`: the Worker switch. */
  readonly isEnabled: () => boolean;
  /**
   * `isGroundedGenerationEnabled(env, tier)`: whether `tier` runs grounded
   * generation. Unset switches mean off; nothing reads it until 3a/3b.
   */
  readonly isGroundedEnabled: (tier: SubscriptionTier) => boolean;
  /** Runs `fn` with a database client that lives for this step only. */
  readonly withDb: <T>(fn: (db: DbClient) => Promise<T>) => Promise<T>;
  /** Starts module lessons after success (the Worker's lessons Workflow starter). */
  readonly startModuleLessons: NonNullable<
    EnqueueModuleLessonGenerationsDeps['start']
  >;
  readonly logger: Pick<Logger, 'info' | 'warn' | 'error'>;
  /** Builds `NonRetryableError` from `cloudflare:workflows`. */
  readonly nonRetryable: (message: string) => Error;
};

type RunContext = {
  readonly input: PlanGenerationWorkflowInput;
  readonly generationPurpose: GenerationPurpose;
  readonly reservation: AttemptReservation;
  readonly processInput: ProcessGenerationInput;
  readonly workflowMetadata: AttemptWorkflowMetadata;
  readonly instanceId: string;
  readonly deps: PlanGenerationWorkflowDeps;
};

/**
 * One structured line per step execution so Workers Logs CPU records can be
 * matched to steps (design note, Decision 9). No in-code CPU timers: they do
 * not advance during CPU-only work on Workers.
 */
function logStep(
  run: RunContext,
  step: StepName,
  fields: { outcome: string; errorKind?: string; taskCount?: number },
  level: 'info' | 'warn' = 'info',
): void {
  run.deps.logger[level](
    {
      job: PLAN_GENERATION_JOB,
      step,
      instanceId: run.instanceId,
      planId: run.input.planId,
      attemptId: run.reservation.attemptId,
      ...fields,
    },
    'Plan generation workflow step finished',
  );
}

function lifecycleFor(db: DbClient, run: RunContext) {
  return createPlanLifecycleService({
    dbClient: db,
    startModuleLessons: run.deps.startModuleLessons,
  });
}

/** `already_finalized` once the attempt is `success` or `failure`; throws when stale. */
function checkFinalized(db: DbClient, run: RunContext) {
  return validateReservation(db, {
    planId: run.input.planId,
    userId: run.input.userId,
    tier: run.input.tier,
    input: run.input.input,
    generationPurpose: run.generationPurpose,
    reservation: run.reservation,
  });
}

/** Settles the reserved attempt as a retryable failure, keeping the instance ID. */
async function settleRetryableFailure(
  db: DbClient,
  run: RunContext,
  message: string,
): Promise<void> {
  await lifecycleFor(db, run).settleReservedAttemptFailure({
    reservation: run.reservation,
    planId: run.input.planId,
    userId: run.input.userId,
    error: new Error(message),
    classification: 'provider_error',
    generationPurpose: run.generationPurpose,
    retryable: true,
    workflowMetadata: run.workflowMetadata,
  });
}

function toGenerateStepResult(result: GenerationRunResult): GenerateStepResult {
  switch (result.status) {
    case 'already_finalized':
      return { kind: 'already_finalized' };
    case 'success':
      return {
        kind: 'generated',
        modules: result.modules,
        metadata: result.metadata,
        usage: result.usage,
        durationMs: result.durationMs,
        extendedTimeout: result.extendedTimeout,
      };
    case 'failure':
      return {
        kind: 'failed',
        classification: result.classification,
        ...(result.metadata !== undefined ? { metadata: result.metadata } : {}),
        ...(result.usage !== undefined ? { usage: result.usage } : {}),
        durationMs: result.durationMs,
        timedOut: result.timedOut ?? false,
        extendedTimeout: result.extendedTimeout ?? false,
      };
  }
}

/** A held reservation never yields a reservation rejection, so failures carry it. */
function toGenerationRunResult(
  generated: Extract<GenerateStepResult, { kind: 'generated' | 'failed' }>,
  reservation: AttemptReservation,
): GenerationRunResult {
  if (generated.kind === 'generated') {
    return {
      status: 'success',
      modules: generated.modules,
      metadata: generated.metadata,
      usage: generated.usage,
      durationMs: generated.durationMs,
      reservation,
      extendedTimeout: generated.extendedTimeout,
    };
  }
  return {
    status: 'failure',
    classification: generated.classification,
    error: new Error(`Plan generation failed (${generated.classification}).`),
    ...(generated.metadata !== undefined
      ? { metadata: generated.metadata }
      : {}),
    ...(generated.usage !== undefined ? { usage: generated.usage } : {}),
    durationMs: generated.durationMs,
    reservation,
    timedOut: generated.timedOut,
    extendedTimeout: generated.extendedTimeout,
  };
}

function toOutcomeKind(
  result: GenerationAttemptResult,
): PlanGenerationWorkflowOutcome['kind'] {
  switch (result.status) {
    case 'generation_success':
      return 'success';
    case 'retryable_failure':
    case 'permanent_failure':
    case 'already_finalized':
      return result.status;
  }
}

/** Step 1: store the instance ID on the attempt (`metadata.workflow`). */
async function recordWorkflowStep(
  db: DbClient,
  run: RunContext,
): Promise<{ readonly kind: 'recorded' }> {
  await mergeAttemptWorkflowMetadata(
    db,
    run.reservation.attemptId,
    run.workflowMetadata,
  );
  logStep(run, 'record-workflow', { outcome: 'recorded' });
  return { kind: 'recorded' };
}

/**
 * Step 2: re-check the switch, then the shared lifecycle's provider half:
 * replay check, provider call under the adaptive timeout, parse, pace.
 * Provider and parse failures come back classified exactly as on Vercel.
 */
async function generateStep(
  db: DbClient,
  run: RunContext,
): Promise<GenerateStepResult> {
  // Switch dropped since the command was accepted: no provider call (Decision 7).
  if (!run.deps.isEnabled()) {
    logStep(run, 'generate', { outcome: 'disabled' });
    return { kind: 'disabled' };
  }

  const result = toGenerateStepResult(
    await lifecycleFor(db, run).runGenerationWithReservation(
      run.processInput,
      run.reservation,
    ),
  );

  if (result.kind === 'generated') {
    logStep(run, 'generate', {
      outcome: 'generated',
      taskCount: result.modules.reduce(
        (sum, module) => sum + module.tasks.length,
        0,
      ),
    });
  } else if (result.kind === 'failed') {
    logStep(
      run,
      'generate',
      { outcome: 'failed', errorKind: result.classification },
      'warn',
    );
  } else {
    logStep(run, 'generate', { outcome: 'already_finalized' });
  }
  return result;
}

/**
 * Step 3: settle in one transaction through the shared lifecycle (attempt,
 * plan, content, usage), then start the first lessons. A paused run settles
 * as a retryable failure. A retry first checks whether its commit landed.
 */
async function finalizeStep(
  db: DbClient,
  run: RunContext,
  generated: Exclude<GenerateStepResult, { kind: 'already_finalized' }>,
  attempt: number,
): Promise<PlanGenerationWorkflowOutcome> {
  if (attempt > 1 && (await checkFinalized(db, run))) {
    logStep(run, 'finalize', { outcome: 'already_finalized' });
    return { kind: 'already_finalized' };
  }

  if (generated.kind === 'disabled') {
    await settleRetryableFailure(db, run, PAUSED_MESSAGE);
    logStep(run, 'finalize', { outcome: 'disabled' });
    return { kind: 'disabled' };
  }

  const kind = toOutcomeKind(
    await lifecycleFor(db, run).settleGenerationResult(
      run.processInput,
      toGenerationRunResult(generated, run.reservation),
    ),
  );
  logStep(run, 'finalize', {
    outcome: kind,
    ...(generated.kind === 'failed'
      ? { errorKind: generated.classification }
      : {}),
  });
  return { kind };
}

/**
 * Failure path after any thrown step: settle the attempt as a retryable
 * failure, as the app does when a Vercel run fails, unless it is already
 * finalized.
 */
async function failStep(
  db: DbClient,
  run: RunContext,
): Promise<{ readonly outcome: string }> {
  if (await checkFinalized(db, run)) {
    logStep(run, 'fail', { outcome: 'already_finalized' });
    return { outcome: 'already_finalized' };
  }

  await settleRetryableFailure(db, run, WORKFLOW_FAILURE_MESSAGE);
  logStep(run, 'fail', { outcome: 'failure_recorded' });
  return { outcome: 'failure_recorded' };
}

/**
 * The plan-generation Workflow body: `record-workflow` → `generate` →
 * `finalize`, with a `fail` step after any thrown step. Each step opens its
 * own database pool through `deps.withDb`.
 */
export async function runPlanGenerationWorkflow(
  event: Readonly<WorkflowEvent<PlanGenerationWorkflowParams>>,
  step: Pick<WorkflowStep, 'do'>,
  deps: PlanGenerationWorkflowDeps,
): Promise<PlanGenerationWorkflowOutcome> {
  const parsed = planGenerationStartCommandSchema.safeParse(event.payload);
  if (!parsed.success) {
    throw deps.nonRetryable('Plan generation workflow params are invalid');
  }
  const input = toPlanGenerationWorkflowInput(parsed.data);
  const generationPurpose = resolvePlanGenerationWorkflowPurpose(input);
  const workflowMetadata: AttemptWorkflowMetadata = {
    provider: 'cloudflare-workflow',
    runId: event.instanceId,
    startedAt: input.reservation.startedAt,
  };
  const run: RunContext = {
    input,
    generationPurpose,
    reservation: fromSerializableReservation(
      input.reservation,
      generationPurpose,
    ),
    processInput: toPlanGenerationProcessInput(
      input,
      generationPurpose,
      workflowMetadata,
    ),
    workflowMetadata,
    instanceId: event.instanceId,
    deps,
  };

  let current: StepName = 'record-workflow';
  try {
    await step.do(
      PLAN_GENERATION_STEPS.recordWorkflow,
      RECORD_WORKFLOW_STEP_CONFIG,
      async () => deps.withDb((db) => recordWorkflowStep(db, run)),
    );

    current = 'generate';
    const generated = await step.do(
      PLAN_GENERATION_STEPS.generate,
      generateStepConfig(),
      async () => deps.withDb((db) => generateStep(db, run)),
    );
    if (generated.kind === 'already_finalized') {
      return { kind: 'already_finalized' };
    }

    current = 'finalize';
    return await step.do(
      PLAN_GENERATION_STEPS.finalize,
      FINALIZE_STEP_CONFIG,
      async (ctx) =>
        deps.withDb((db) => finalizeStep(db, run, generated, ctx.attempt)),
    );
  } catch (error) {
    deps.logger.warn(
      {
        err: error,
        job: PLAN_GENERATION_JOB,
        step: current,
        instanceId: run.instanceId,
        planId: input.planId,
        attemptId: run.reservation.attemptId,
      },
      'Plan generation workflow step failed',
    );
    await step.do(PLAN_GENERATION_STEPS.fail, FAIL_STEP_CONFIG, async () =>
      deps.withDb((db) => failStep(db, run)),
    );
    return { kind: 'failed' };
  }
}
