import type { PlanLifecycleService } from '@/features/plans/lifecycle/service';
import type { AttemptsDbClient } from '@/lib/db/queries/types/attempts.types';

import {
  preparePlanGenerationSessionCommand,
  type RespondCreateStreamArgs,
  type RespondRetryStreamArgs,
  type SessionCommand,
} from './session-command';
import { runPlanGenerationSessionStream } from './stream-transport';
import { createWorkflowBackedProcessGeneration } from '@/features/plans/create-workflow-backed-process-generation';
import { createPlanLifecycleService } from '@/features/plans/lifecycle/factory';
import { workflowEnv } from '@/lib/config/env/workflow';
import { db as serviceRoleDb } from '@supabase/service-role';

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
 * on the trusted server-owned DB client.
 */
export function createPlanGenerationSessionBoundary(
  deps: CreateSessionBoundaryDeps = {},
): PlanGenerationSessionBoundary {
  const buildLifecycle: CreateLifecycleService =
    deps.createLifecycleService ??
    (() => createPlanLifecycleService({ dbClient: serviceRoleDb }));

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
  const lifecycleService = buildLifecycle(serviceRoleDb);

  const prepared = await preparePlanGenerationSessionCommand({
    command,
    lifecycleService,
  });

  const processGeneration = workflowEnv.planGenerationWorkflowEnabled
    ? createWorkflowBackedProcessGeneration(
        lifecycleService,
        serviceRoleDb,
        command.requestId ?? `plan-gen-${prepared.planId}`,
      )
    : lifecycleService.processGenerationAttempt.bind(lifecycleService);

  return await runPlanGenerationSessionStream({
    requestSignal: command.req.signal,
    requestId: command.requestId,
    authUserId: command.authUserId,
    dbClient: serviceRoleDb,
    cleanup: async () => {},
    prepared,
    processGeneration,
    responseHeaders: command.responseHeaders,
  });
}
