import type { PlanGenerationWorkflowInput } from '@/features/plans/workflows/plan-generation.types';

import { jobsWorkerEnv } from '@/lib/config/env/jobs-worker';
import {
  sendJobsWorkerCommand,
  type JobsWorkerClientConfig,
} from '@/lib/jobs-worker/client';
import {
  JOBS_COMMAND_PATHS,
  type JobsUnavailableCode,
} from '@/lib/jobs-worker/contract';
import { logger } from '@/lib/logging/logger';

export type PlanGenerationDispatchResult =
  /** `202 { accepted, instanceId }`: a new Workflow instance owns the attempt. */
  | { readonly kind: 'accepted'; readonly instanceId: string }
  /** 2xx without an instance ID: an instance for this attempt already exists. */
  | { readonly kind: 'duplicate' }
  /** `503 { code: "jobs_paused" | "job_disabled" }`. */
  | { readonly kind: 'disabled'; readonly code: JobsUnavailableCode }
  /** Any other non-2xx, timeout, network error, or missing configuration. */
  | { readonly kind: 'failed' };

export type DispatchPlanGenerationToWorkerDeps = {
  readonly send?: typeof sendJobsWorkerCommand;
  readonly config?: () => JobsWorkerClientConfig;
  readonly log?: Pick<typeof logger, 'info' | 'warn' | 'error'>;
};

const UNAVAILABLE_CODES: readonly JobsUnavailableCode[] = [
  'jobs_paused',
  'job_disabled',
];

function readInstanceId(body: unknown): string | undefined {
  if (typeof body === 'object' && body !== null && 'instanceId' in body) {
    return typeof body.instanceId === 'string' && body.instanceId.length > 0
      ? body.instanceId
      : undefined;
  }
  return undefined;
}

/**
 * Sends `POST /v1/plan-generation/start` for an attempt the app already
 * reserved (design note, Decision 4, App handling). The caller settles the
 * reservation as a retryable failure on `disabled` or `failed`. Never throws.
 */
export async function dispatchPlanGenerationToWorker(
  input: PlanGenerationWorkflowInput,
  deps: DispatchPlanGenerationToWorkerDeps = {},
): Promise<PlanGenerationDispatchResult> {
  const send = deps.send ?? sendJobsWorkerCommand;
  const log = deps.log ?? logger;
  const context = {
    planId: input.planId,
    userId: input.userId,
    attemptId: input.reservation.attemptId,
    correlationId: input.correlationId,
  };

  try {
    const config = deps.config?.() ?? {
      url: jobsWorkerEnv.url,
      signingSecret: jobsWorkerEnv.signingSecret,
    };
    const result = await send(
      JOBS_COMMAND_PATHS.planGenerationStart,
      { v: 1, ...input },
      { config },
    );

    if (result.kind === 'accepted') {
      const instanceId = readInstanceId(result.body);
      log.info(
        { ...context, status: result.status, instanceId },
        instanceId
          ? 'Plan generation handed to the jobs Worker'
          : 'Jobs Worker already has a plan generation instance for this attempt',
      );
      return instanceId
        ? { kind: 'accepted', instanceId }
        : { kind: 'duplicate' };
    }

    log.warn(
      {
        ...context,
        outcome: result.kind,
        ...(result.kind === 'rejected'
          ? { status: result.status, code: result.code }
          : { reason: result.reason }),
      },
      'Jobs Worker did not accept plan generation',
    );

    if (result.kind === 'rejected' && result.status === 503) {
      const code = UNAVAILABLE_CODES.find(
        (candidate) => candidate === result.code,
      );
      if (code) {
        return { kind: 'disabled', code };
      }
    }
    return { kind: 'failed' };
  } catch (error) {
    log.error(
      { ...context, err: error },
      'Failed to send plan generation to the jobs Worker',
    );
    return { kind: 'failed' };
  }
}
