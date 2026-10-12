import type { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type { AttemptsDbClient } from '@/lib/db/queries/types/attempts.types';
import type { FailureClassification } from '@/shared/types/failure-classification.types';

import {
  preparePlanGenerationSessionCommand,
  type RespondCreateStreamArgs,
  type RespondRetryStreamArgs,
  type SessionCommand,
} from './session-command';
import { runPlanGenerationSessionStream } from './stream-transport';
import { getFailurePresentation } from '@/features/ai/failure-presentation';
import { createWorkflowBackedProcessGeneration } from '@/features/plans/create-workflow-backed-process-generation';
import { createPlanLifecycleService } from '@/features/plans/lifecycle/factory';
import { PLAN_CREATION_FAILURE_HTTP_MAP } from '@/features/plans/plan-creation-failure-http';
import {
  startPlanGenerationAttempt,
  type StartPlanGenerationAttemptDeps,
  type StartPlanGenerationAttemptResult,
} from '@/features/plans/start-plan-generation-attempt';
import { AppError } from '@/lib/api/errors';
import {
  jobsWorkerEnv,
  type PlanGenerationRuntime,
} from '@/lib/config/env/jobs-worker';
import { serializeErrorForLog } from '@/lib/errors';
import { logger } from '@/lib/logging/logger';
import { db as serviceRoleDb } from '@supabase/service-role';

export {
  PLAN_RETRY_RESERVATION_ALLOWED_STATUSES,
  type RetryPlanGenerationPlanSnapshot,
  type RespondCreateStreamArgs,
  type RespondRetryStreamArgs,
} from './session-command';

/** Args for `startCreate`: the stream args without SSE response headers. */
export type StartCreateArgs = Omit<RespondCreateStreamArgs, 'responseHeaders'>;

/** Args for `startRetry`: the stream args without SSE response headers. */
export type StartRetryArgs = Omit<RespondRetryStreamArgs, 'responseHeaders'>;

/** `202` body of `POST /api/v1/plans` and `POST /api/v1/plans/:planId/retry`. */
export type StartedPlanGeneration = {
  readonly planId: string;
  readonly attemptId: string;
};

/**
 * Public boundary that turns a validated create or retry intent into either a
 * streaming plan-generation `Response` (legacy SSE) or a started attempt the
 * client polls (`startCreate` / `startRetry`).
 *
 * Implementations hide:
 * - create vs retry preparation
 * - `plan_start` emission and SSE sequencing
 * - the `PLAN_GENERATION_RUNTIME` hand-off
 * - unhandled-exception cleanup
 */
export interface PlanGenerationSessionBoundary {
  respondCreateStream(args: RespondCreateStreamArgs): Promise<Response>;
  respondRetryStream(args: RespondRetryStreamArgs): Promise<Response>;
  /**
   * Creates the plan, reserves its first attempt, and starts it.
   * @throws AppError when nothing was started; `details.planId` names the plan
   * when one exists.
   */
  startCreate(args: StartCreateArgs): Promise<StartedPlanGeneration>;
  /** Reserves and starts a retry attempt; throws like `startCreate`. */
  startRetry(args: StartRetryArgs): Promise<StartedPlanGeneration>;
}

/** Lifecycle factory injected at the boundary; defaults to the production wiring. */
type CreateLifecycleService = (
  dbClient: AttemptsDbClient,
) => PlanLifecycleService;

/** Optional dependency overrides for {@link createPlanGenerationSessionBoundary}. */
interface CreateSessionBoundaryDeps {
  createLifecycleService?: CreateLifecycleService;
  /** Defaults to `PLAN_GENERATION_RUNTIME` (`jobsWorkerEnv.planGenerationRuntime`). */
  runtime?: () => PlanGenerationRuntime;
  startDeps?: StartPlanGenerationAttemptDeps;
}

/**
 * Build a {@link PlanGenerationSessionBoundary}.
 *
 * Tests inject a fake `createLifecycleService` to swap the lifecycle service
 * under the boundary; production uses default `createPlanLifecycleService`
 * on the trusted server-owned DB client.
 */
export function createPlanGenerationSessionBoundary(
  deps: CreateSessionBoundaryDeps = {},
): PlanGenerationSessionBoundary {
  const buildLifecycle: CreateLifecycleService =
    deps.createLifecycleService ??
    (() => createPlanLifecycleService({ dbClient: serviceRoleDb }));

  const readRuntime =
    deps.runtime ?? (() => jobsWorkerEnv.planGenerationRuntime);

  return {
    respondCreateStream: (args) =>
      run({ kind: 'create', ...args }, buildLifecycle),
    respondRetryStream: (args) =>
      run({ kind: 'retry', ...args }, buildLifecycle),
    startCreate: (args) =>
      startGeneration({ kind: 'create', ...args }, buildLifecycle, {
        readRuntime,
        startDeps: deps.startDeps,
      }),
    startRetry: (args) =>
      startGeneration({ kind: 'retry', ...args }, buildLifecycle, {
        readRuntime,
        startDeps: deps.startDeps,
      }),
  };
}

async function run(
  command: SessionCommand,
  buildLifecycle: CreateLifecycleService,
): Promise<Response> {
  const lifecycleService = buildLifecycle(serviceRoleDb);

  const prepared = await preparePlanGenerationSessionCommand({
    command,
    lifecycleService,
  });

  const processGeneration = createWorkflowBackedProcessGeneration(
    lifecycleService,
    serviceRoleDb,
    command.requestId ?? `plan-gen-${prepared.planId}`,
  );

  return await runPlanGenerationSessionStream({
    requestSignal: command.req.signal,
    requestId: command.requestId,
    authUserId: command.authUserId,
    dbClient: serviceRoleDb,
    prepared,
    processGeneration,
    responseHeaders: command.responseHeaders,
  });
}

/**
 * The canonical error for an attempt that never started (reservation rejected,
 * runtime refused, or an unexpected start error). The message and code match
 * the SSE `error` event the stream route emits for the same classification;
 * `details.planId` lets the client open the plan page, as `plan_start` did.
 */
function planGenerationNotStartedError(
  planId: string,
  classification: FailureClassification | 'unknown',
  cause?: unknown,
): AppError {
  const presentation = getFailurePresentation(classification);
  const { status } =
    PLAN_CREATION_FAILURE_HTTP_MAP[classification] ??
    PLAN_CREATION_FAILURE_HTTP_MAP.unknown;

  return new AppError(presentation.message, {
    status,
    code: presentation.code,
    classification: classification === 'unknown' ? undefined : classification,
    details: { planId, retryable: presentation.retryable },
    ...(cause !== undefined ? { cause } : {}),
  });
}

async function startGeneration(
  command: SessionCommand,
  buildLifecycle: CreateLifecycleService,
  deps: {
    readRuntime: () => PlanGenerationRuntime;
    startDeps?: StartPlanGenerationAttemptDeps;
  },
): Promise<StartedPlanGeneration> {
  // Read before creating or reserving anything, so a misconfigured value
  // cannot leave a plan or attempt behind.
  const runtime = deps.readRuntime();
  const lifecycleService = buildLifecycle(serviceRoleDb);

  const prepared = await preparePlanGenerationSessionCommand({
    command,
    lifecycleService,
  });

  const startedAt = Date.now();
  let result: StartPlanGenerationAttemptResult;
  try {
    result = await startPlanGenerationAttempt(
      {
        lifecycleService,
        dbClient: serviceRoleDb,
        correlationId: command.requestId ?? `plan-gen-${prepared.planId}`,
        runtime,
        input: prepared.generationInput,
      },
      deps.startDeps,
    );
  } catch (error) {
    try {
      await prepared.onUnhandledError(error, startedAt, serviceRoleDb);
    } catch (cleanupError) {
      logger.error(
        {
          planId: prepared.planId,
          cleanupError: serializeErrorForLog(cleanupError),
          sourceError: serializeErrorForLog(error),
        },
        'Failed cleanup after plan generation start error',
      );
    }
    throw planGenerationNotStartedError(
      prepared.planId,
      prepared.fallbackClassification,
      error,
    );
  }

  if (result.kind === 'not_started') {
    throw planGenerationNotStartedError(prepared.planId, result.classification);
  }
  return { planId: prepared.planId, attemptId: result.attemptId };
}
