import type { ModuleLessonBatchPromptInput } from '@/features/lesson-content/module-lesson-prompts';
import type { DbClient } from '@/lib/db/types';
import type { Logger } from '@/lib/logging/logger';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

import { resolveTimeoutConfig } from '@/features/ai/orchestrator/timeout-lifecycle';
import { ParserError } from '@/features/ai/parser';
import { classifyModuleLessonGenerationPreflight } from '@/features/lesson-content/module-lesson-generation-preflight';
import {
  buildModuleLessonBatchInput,
  buildModuleLessonBatchPromptInput,
  checkModuleLessonGenerationGate,
  generateModuleLessonRawBatch,
  type ModuleLessonGenerationTarget,
  type ModuleLessonProvider,
  persistModuleLessonBatch,
  recordModuleLessonGenerationFailure,
  resolveModuleLessonProvider,
} from '@/features/lesson-content/run-module-lesson-generation-work';
import {
  claimModuleLessonGenerationOrDescribe,
  loadModuleLessonGenerationContext,
  revertModuleLessonGeneratingToNotGenerated,
} from '@/lib/db/queries/module-lesson-generation';
import {
  type ModuleLessonsStartCommand,
  moduleLessonsStartCommandSchema,
} from '@/lib/jobs-worker/contract';

export const MODULE_LESSONS_JOB = 'module-lessons';

/** Instance params: the signed start command, `v` included. */
export type ModuleLessonsWorkflowParams = ModuleLessonsStartCommand;

/**
 * Step names are final once deployed: never rename, reorder, or remove them
 * while instances may be in flight (design note, Decision 6).
 */
export const MODULE_LESSONS_STEPS = {
  claim: 'claim',
  generate: 'generate',
  parseCommit: 'parse-commit',
  fail: 'fail',
  /** One more provider call and parse when the first output fails to parse. */
  generateRetry: 'generate-retry',
  parseCommitRetry: 'parse-commit-retry',
} as const;

type StepName =
  (typeof MODULE_LESSONS_STEPS)[keyof typeof MODULE_LESSONS_STEPS];

/** Keeps a long schema error readable in logs and the instance error. */
const PARSE_ERROR_MESSAGE_MAX_CHARS = 1_000;

/**
 * Parse failures that a second provider call can fix: malformed or empty JSON,
 * a wrong task count, or a schema miss. `invalid_input` is a caller bug.
 */
const RETRYABLE_PARSE_ERROR_KINDS: ReadonlySet<string> = new Set([
  'invalid_json',
  'validation',
]);

/** Which provider call this is: the first, or the one retry after a parse failure. */
type GenerationAttempt = 1 | 2;

/** Margin over the AI timeout so the provider abort fires before the step's. */
const GENERATE_STEP_TIMEOUT_MARGIN_MS = 60_000;

/** Claim is DB-only and replay-safe: retry transient failures. */
export const CLAIM_STEP_CONFIG = {
  retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
} as const;

/** Commit retries cover transient DB errors only; parse errors are permanent. */
export const PARSE_COMMIT_STEP_CONFIG = {
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

export type ModuleLessonsWorkflowOutcome = {
  readonly kind:
    | 'success'
    | 'failed'
    | 'disabled'
    | 'not_found'
    | 'locked'
    | 'already_ready'
    | 'in_flight';
};

type ClaimStepResult =
  | {
      readonly kind: 'claimed';
      readonly startedAt: string;
      readonly promptInput: ModuleLessonBatchPromptInput;
    }
  | { readonly kind: Exclude<ModuleLessonsWorkflowOutcome['kind'], 'success'> };

type GenerateStepResult =
  | {
      readonly kind: 'generated';
      readonly rawText: string;
      readonly usage: CanonicalAIUsage;
    }
  | { readonly kind: 'disabled' };

type ParseCommitStepResult =
  | { readonly kind: 'success' }
  | {
      readonly kind: 'parse_failed';
      readonly errorKind: string;
      readonly errorMessage: string;
      readonly retryable: boolean;
    };

export type ModuleLessonsWorkflowDeps = {
  /** `isJobEnabled(env, 'MODULE_LESSONS')`: the Worker form of the lesson flag. */
  readonly isEnabled: () => boolean;
  /** Runs `fn` with a database client that lives for this step only. */
  readonly withDb: <T>(fn: (db: DbClient) => Promise<T>) => Promise<T>;
  readonly logger: Pick<Logger, 'info' | 'warn' | 'error'>;
  /** Builds `NonRetryableError` from `cloudflare:workflows`. */
  readonly nonRetryable: (message: string) => Error;
  /** Test seam; production resolves the user's lesson model. */
  readonly provider?: ModuleLessonProvider;
  readonly now?: () => Date;
};

type RunContext = {
  readonly params: ModuleLessonsWorkflowParams;
  readonly target: ModuleLessonGenerationTarget;
  readonly instanceId: string;
  readonly deps: ModuleLessonsWorkflowDeps;
  readonly now: () => Date;
};

/**
 * One structured line per step execution so Workers Logs CPU records can be
 * matched to steps (design note, Decision 9). No in-code CPU timers: they do
 * not advance during CPU-only work on Workers.
 */
function logStep(
  run: RunContext,
  step: StepName,
  fields: {
    attempt?: GenerationAttempt;
    taskCount?: number;
    rawChars?: number;
    finishReason?: string;
    outcome: string;
    errorKind?: string;
    errorMessage?: string;
  },
  level: 'info' | 'warn' = 'info',
): void {
  run.deps.logger[level](
    {
      job: MODULE_LESSONS_JOB,
      step,
      instanceId: run.instanceId,
      planId: run.target.planId,
      moduleId: run.target.moduleId,
      ...fields,
    },
    'Module lessons workflow step finished',
  );
}

function revertArgs(run: RunContext) {
  return {
    ...run.target,
    workflowRunId: run.instanceId,
    batchRequestId: run.params.batchRequestId,
  };
}

/**
 * Step 1: load, re-check the switch, preflight, content access, then claim or
 * adopt the app's provisional claim with this instance as the run.
 */
async function claimStep(
  db: DbClient,
  run: RunContext,
): Promise<ClaimStepResult> {
  const { target } = run;
  const load = await loadModuleLessonGenerationContext(
    db,
    target.planId,
    target.moduleId,
    target.userId,
  );
  const taskCount = load?.tasks.length ?? 0;

  if (!run.deps.isEnabled()) {
    await revertModuleLessonGeneratingToNotGenerated(db, revertArgs(run));
    logStep(run, 'claim', { taskCount, outcome: 'disabled' });
    return { kind: 'disabled' };
  }

  const preflight = classifyModuleLessonGenerationPreflight(load);
  if (
    preflight.kind === 'not_found' ||
    preflight.kind === 'locked' ||
    preflight.kind === 'already_ready'
  ) {
    logStep(run, 'claim', { taskCount, outcome: preflight.kind });
    return { kind: preflight.kind };
  }

  const gate = await checkModuleLessonGenerationGate(target, {
    dbClient: db,
    resolveGenerationEnabled: async () => run.deps.isEnabled(),
  });
  if (gate !== 'open') {
    await revertModuleLessonGeneratingToNotGenerated(db, revertArgs(run));
    const kind = gate === 'disabled' ? 'disabled' : 'failed';
    logStep(run, 'claim', { taskCount, outcome: kind });
    return { kind };
  }

  const existingWorkflow = load?.module.lessonGenerationMetadata?.workflow;
  const startedAt =
    existingWorkflow?.runId === run.instanceId && existingWorkflow.startedAt
      ? existingWorkflow.startedAt
      : run.now().toISOString();

  const claim = await claimModuleLessonGenerationOrDescribe(
    db,
    target.planId,
    target.moduleId,
    target.userId,
    {
      batchRequestId: run.params.batchRequestId,
      workflow: {
        provider: 'cloudflare-workflow',
        runId: run.instanceId,
        startedAt,
      },
    },
  );
  if (claim.kind !== 'claimed' || !load) {
    const kind = claim.kind === 'claimed' ? 'not_found' : claim.kind;
    logStep(run, 'claim', { taskCount, outcome: kind });
    return { kind };
  }

  logStep(run, 'claim', { taskCount, outcome: 'claimed' });
  return {
    kind: 'claimed',
    startedAt: claim.workflowStartedAt ?? startedAt,
    promptInput: buildModuleLessonBatchPromptInput(load),
  };
}

/**
 * Step 2 (`generate`, or `generate-retry` after a parse failure): re-check the
 * switch, mark provider started, call, buffer. The provider-start marker is a
 * no-op on the retry, so usage quota counts the module once.
 */
async function generateStep(
  db: DbClient,
  run: RunContext,
  promptInput: ModuleLessonBatchPromptInput,
  attempt: GenerationAttempt,
): Promise<GenerateStepResult> {
  const stepName: StepName = attempt === 1 ? 'generate' : 'generate-retry';
  const taskCount = promptInput.tasks.length;
  // Switch dropped since the claim: release it, as on a flag drop today.
  if (!run.deps.isEnabled()) {
    await revertModuleLessonGeneratingToNotGenerated(db, revertArgs(run));
    logStep(run, stepName, { attempt, taskCount, outcome: 'disabled' });
    return { kind: 'disabled' };
  }

  const provider = await resolveModuleLessonProvider(
    { userId: run.target.userId, modelOverride: run.params.modelOverride },
    db,
    run.deps.provider,
  );
  const batch = await generateModuleLessonRawBatch({
    target: run.target,
    batchInput: buildModuleLessonBatchInput(promptInput),
    provider,
    dbClient: db,
    timeoutConfig: resolveTimeoutConfig(),
    now: run.now,
  });

  logStep(run, stepName, {
    attempt,
    taskCount,
    rawChars: batch.rawText.length,
    finishReason: batch.finishReason,
    outcome: 'generated',
  });
  return { kind: 'generated', rawText: batch.rawText, usage: batch.usage };
}

/**
 * Step 3 (`parse-commit`, or `parse-commit-retry`): parse and commit. A parse
 * failure is returned, not thrown, so the workflow can decide whether to call
 * the provider again; step retries cover transient DB errors only.
 */
async function parseCommitStep(
  db: DbClient,
  run: RunContext,
  claim: Extract<ClaimStepResult, { kind: 'claimed' }>,
  generated: Extract<GenerateStepResult, { kind: 'generated' }>,
  attempt: GenerationAttempt,
  stepAttempt: number,
): Promise<ParseCommitStepResult> {
  const stepName: StepName =
    attempt === 1 ? 'parse-commit' : 'parse-commit-retry';
  const taskCount = claim.promptInput.tasks.length;
  const rawChars = generated.rawText.length;

  // A retry after a commit whose response was lost finds the module ready.
  if (stepAttempt > 1) {
    const load = await loadModuleLessonGenerationContext(
      db,
      run.target.planId,
      run.target.moduleId,
      run.target.userId,
    );
    if (
      load?.module.lessonGenerationStatus === 'ready' &&
      load.module.lessonGenerationMetadata?.workflow?.runId === run.instanceId
    ) {
      logStep(run, stepName, {
        attempt,
        taskCount,
        rawChars,
        outcome: 'success',
      });
      return { kind: 'success' };
    }
  }

  try {
    await persistModuleLessonBatch({
      target: run.target,
      batch: generated,
      expectedTaskIds: claim.promptInput.tasks.map((task) => task.taskId),
      metadata: {
        version: 1,
        batchRequestId: run.params.batchRequestId,
        workflow: {
          provider: 'cloudflare-workflow',
          runId: run.instanceId,
          startedAt: claim.startedAt,
          completedAt: run.now().toISOString(),
        },
      },
      dbClient: db,
      now: run.now,
    });
  } catch (error) {
    if (error instanceof ParserError) {
      // The parser's message names the failing check or schema path, never
      // the provider text, so it is safe to log.
      const errorMessage = error.message.slice(
        0,
        PARSE_ERROR_MESSAGE_MAX_CHARS,
      );
      logStep(
        run,
        stepName,
        {
          attempt,
          taskCount,
          rawChars,
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
    throw error;
  }

  logStep(run, stepName, { attempt, taskCount, rawChars, outcome: 'success' });
  return { kind: 'success' };
}

/** A parse failure the workflow will not retry: ends the run in `fail`. */
function parseFailedError(
  run: RunContext,
  result: Extract<ParseCommitStepResult, { kind: 'parse_failed' }>,
): Error {
  return run.deps.nonRetryable(
    `Module lesson batch could not be parsed (${result.errorKind}): ${result.errorMessage}`,
  );
}

/**
 * Failure path. A failed claim step reverts (the provider never started). A
 * later failure marks the module `failed` (or reverts when the provider never
 * started and that write fails), but only while this instance owns the claim.
 */
async function failStep(
  db: DbClient,
  run: RunContext,
  failedStep: StepName,
): Promise<{ readonly outcome: string }> {
  if (failedStep === 'claim') {
    await revertModuleLessonGeneratingToNotGenerated(db, revertArgs(run));
    logStep(run, 'fail', { outcome: 'reverted' });
    return { outcome: 'reverted' };
  }

  const load = await loadModuleLessonGenerationContext(
    db,
    run.target.planId,
    run.target.moduleId,
    run.target.userId,
  );
  const taskCount = load?.tasks.length ?? 0;
  const metadata = load?.module.lessonGenerationMetadata;
  if (
    load?.module.lessonGenerationStatus !== 'generating' ||
    metadata?.workflow?.runId !== run.instanceId
  ) {
    logStep(run, 'fail', { taskCount, outcome: 'not_owned' });
    return { outcome: 'not_owned' };
  }

  await recordModuleLessonGenerationFailure({
    target: run.target,
    dbClient: db,
    now: run.now,
    providerStarted: Boolean(metadata.providerStartedAt),
    workflowRunId: run.instanceId,
  });
  logStep(run, 'fail', { taskCount, outcome: 'failure_recorded' });
  return { outcome: 'failure_recorded' };
}

/**
 * The module lessons Workflow body: `claim` → `generate` → `parse-commit`,
 * then `generate-retry` → `parse-commit-retry` once when the first output
 * fails to parse, with a `fail` step after any thrown step. Each step opens
 * its own database pool through `deps.withDb`.
 */
export async function runModuleLessonsWorkflow(
  event: Readonly<WorkflowEvent<ModuleLessonsWorkflowParams>>,
  step: Pick<WorkflowStep, 'do'>,
  deps: ModuleLessonsWorkflowDeps,
): Promise<ModuleLessonsWorkflowOutcome> {
  const parsed = moduleLessonsStartCommandSchema.safeParse(event.payload);
  if (!parsed.success) {
    throw deps.nonRetryable('Module lessons workflow params are invalid');
  }
  const params = parsed.data;
  const run: RunContext = {
    params,
    target: {
      userId: params.userId,
      planId: params.planId,
      moduleId: params.moduleId,
    },
    instanceId: event.instanceId,
    deps,
    now: deps.now ?? (() => new Date()),
  };

  let current: StepName = 'claim';
  try {
    const claim = await step.do(
      MODULE_LESSONS_STEPS.claim,
      CLAIM_STEP_CONFIG,
      async () => deps.withDb((db) => claimStep(db, run)),
    );
    if (claim.kind !== 'claimed') {
      return { kind: claim.kind };
    }

    current = 'generate';
    const generated = await step.do(
      MODULE_LESSONS_STEPS.generate,
      generateStepConfig(),
      async () =>
        deps.withDb((db) => generateStep(db, run, claim.promptInput, 1)),
    );
    if (generated.kind !== 'generated') {
      return { kind: generated.kind };
    }

    current = 'parse-commit';
    const committed = await step.do(
      MODULE_LESSONS_STEPS.parseCommit,
      PARSE_COMMIT_STEP_CONFIG,
      async (ctx) =>
        deps.withDb((db) =>
          parseCommitStep(db, run, claim, generated, 1, ctx.attempt),
        ),
    );
    if (committed.kind === 'success') {
      return committed;
    }
    if (!committed.retryable) {
      throw parseFailedError(run, committed);
    }

    current = 'generate-retry';
    const regenerated = await step.do(
      MODULE_LESSONS_STEPS.generateRetry,
      generateStepConfig(),
      async () =>
        deps.withDb((db) => generateStep(db, run, claim.promptInput, 2)),
    );
    if (regenerated.kind !== 'generated') {
      return { kind: regenerated.kind };
    }

    current = 'parse-commit-retry';
    const recommitted = await step.do(
      MODULE_LESSONS_STEPS.parseCommitRetry,
      PARSE_COMMIT_STEP_CONFIG,
      async (ctx) =>
        deps.withDb((db) =>
          parseCommitStep(db, run, claim, regenerated, 2, ctx.attempt),
        ),
    );
    if (recommitted.kind !== 'success') {
      throw parseFailedError(run, recommitted);
    }
    return recommitted;
  } catch (error) {
    deps.logger.warn(
      {
        err: error,
        job: MODULE_LESSONS_JOB,
        step: current,
        instanceId: run.instanceId,
        planId: run.target.planId,
        moduleId: run.target.moduleId,
      },
      'Module lessons workflow step failed',
    );
    const failedStep = current;
    await step.do(MODULE_LESSONS_STEPS.fail, FAIL_STEP_CONFIG, async () =>
      deps.withDb((db) => failStep(db, run, failedStep)),
    );
    return { kind: 'failed' };
  }
}
