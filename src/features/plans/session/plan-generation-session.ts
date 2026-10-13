import type { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type { AttemptsDbClient } from '@/lib/db/queries/types/attempts.types';
import type { FailureClassification } from '@/shared/types/failure-classification.types';

import {
  preparePlanGenerationSessionCommand,
  type SessionCommand,
  type StartCreateArgs,
  type StartRetryArgs,
} from './session-command';
import { getFailurePresentation } from '@/features/ai/failure-presentation';
import { createPlanLifecycleService } from '@/features/plans/lifecycle/factory';
import { PLAN_CREATION_FAILURE_HTTP_MAP } from '@/features/plans/plan-creation-failure-http';
import {
  startPlanGenerationAttempt,
  type StartPlanGenerationAttemptDeps,
  type StartPlanGenerationAttemptResult,
} from '@/features/plans/start-plan-generation-attempt';
import { AppError } from '@/lib/api/errors';
import { serializeErrorForLog } from '@/lib/errors';
import { logger } from '@/lib/logging/logger';
import { db as serviceRoleDb } from '@supabase/service-role';

export {
  PLAN_RETRY_RESERVATION_ALLOWED_STATUSES,
  type RetryPlanGenerationPlanSnapshot,
  type StartCreateArgs,
  type StartRetryArgs,
} from './session-command';

/** `202` body of `POST /api/v1/plans` and `POST /api/v1/plans/:planId/retry`. */
export type StartedPlanGeneration = {
  readonly planId: string;
  readonly attemptId: string;
};

/**
 * Public boundary that turns a validated create or retry intent into a started
 * attempt the client polls (`startCreate` / `startRetry`).
 *
 * Implementations hide:
 * - create vs retry preparation
 * - the jobs Worker hand-off
 * - unhandled-exception cleanup
 */
export interface PlanGenerationSessionBoundary {
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

  return {
    startCreate: (args) =>
      startGeneration({ kind: 'create', ...args }, buildLifecycle, {
        startDeps: deps.startDeps,
      }),
    startRetry: (args) =>
      startGeneration({ kind: 'retry', ...args }, buildLifecycle, {
        startDeps: deps.startDeps,
      }),
  };
}

/**
 * The canonical error for an attempt that never started (reservation rejected,
 * Worker refused, or an unexpected start error). The message and code come
 * from the classification's failure presentation; `details.planId` lets the
 * client open the plan page.
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
    startDeps?: StartPlanGenerationAttemptDeps;
  },
): Promise<StartedPlanGeneration> {
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
