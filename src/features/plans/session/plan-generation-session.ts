import { createPlanLifecycleService } from '@/features/plans/lifecycle/factory';

import type { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type { AttemptsDbClient } from '@/lib/db/queries/types/attempts.types';

import { createStreamDbClient } from './stream-db';
import {
  preparePlanGenerationSessionCommand,
  type RespondCreateStreamArgs,
  type RespondRetryStreamArgs,
  type SessionCommand,
} from './session-command';
import { createSafeStreamCleanup } from './stream-cleanup-policy';
import { runPlanGenerationSessionStream } from './stream-transport';

export {
  PLAN_RETRY_RESERVATION_ALLOWED_STATUSES,
  type RetryPlanGenerationPlanSnapshot,
  type RespondCreateStreamArgs,
  type RespondRetryStreamArgs,
} from './session-command';

/**
 * Public boundary that turns a validated create or retry intent into a
 * streaming plan-generation `Response`.
 *
 * Implementations hide:
 * - stream-scoped DB lease lifecycle
 * - create vs retry preparation
 * - `plan_start` emission and SSE sequencing
 * - unhandled-exception cleanup
 */
export interface PlanGenerationSessionBoundary {
  respondCreateStream(args: RespondCreateStreamArgs): Promise<Response>;
  respondRetryStream(args: RespondRetryStreamArgs): Promise<Response>;
}

/** Lifecycle factory injected at the boundary; defaults to the production wiring. */
type CreateLifecycleService = (
  dbClient: AttemptsDbClient,
) => PlanLifecycleService;

/** Optional dependency overrides for {@link createPlanGenerationSessionBoundary}. */
interface CreateSessionBoundaryDeps {
  createLifecycleService?: CreateLifecycleService;
}

/**
 * Build a {@link PlanGenerationSessionBoundary}.
 *
 * Tests inject a fake `createLifecycleService` to swap the lifecycle service
 * under the boundary; production uses default `createPlanLifecycleService`
 * on the stream-scoped DB client.
 */
export function createPlanGenerationSessionBoundary(
  deps: CreateSessionBoundaryDeps = {},
): PlanGenerationSessionBoundary {
  const buildLifecycle: CreateLifecycleService =
    deps.createLifecycleService ??
    ((dbClient) => createPlanLifecycleService({ dbClient }));

  return {
    respondCreateStream: (args) =>
      run({ kind: 'create', ...args }, buildLifecycle),
    respondRetryStream: (args) =>
      run({ kind: 'retry', ...args }, buildLifecycle),
  };
}

async function run(
  command: SessionCommand,
  buildLifecycle: CreateLifecycleService,
): Promise<Response> {
  const { dbClient, cleanup } = await createStreamDbClient(command.authUserId);
  const closeStreamDb = createSafeStreamCleanup(command.authUserId, cleanup);

  try {
    const lifecycleService = buildLifecycle(dbClient);

    const prepared = await preparePlanGenerationSessionCommand({
      command,
      lifecycleService,
    });

    return await runPlanGenerationSessionStream({
      requestSignal: command.req.signal,
      requestId: command.requestId,
      authUserId: command.authUserId,
      dbClient,
      cleanup: closeStreamDb,
      prepared,
      processGeneration:
        lifecycleService.processGenerationAttempt.bind(lifecycleService),
      responseHeaders: command.responseHeaders,
    });
  } catch (error) {
    await closeStreamDb();
    throw error;
  }
}
