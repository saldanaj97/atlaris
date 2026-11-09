import { jobsWorkerEnv } from '@/lib/config/env/jobs-worker';
import {
  sendJobsWorkerCommand,
  type JobsWorkerClientConfig,
} from '@/lib/jobs-worker/client';
import {
  JOBS_COMMAND_PATHS,
  type JobsUnavailableCode,
  type ModuleLessonsStartCommand,
} from '@/lib/jobs-worker/contract';
import { logger } from '@/lib/logging/logger';

export type ModuleLessonsDispatchInput = {
  readonly planId: string;
  readonly moduleId: string;
  readonly userId: string;
  /** Matches the app's provisional claim; the Workflow's claim step adopts it. */
  readonly batchRequestId: string;
  readonly correlationId: string;
  readonly modelOverride?: string;
};

export type ModuleLessonsDispatchResult =
  /** `202 { accepted, instanceId }`: a new Workflow instance owns the claim. */
  | { readonly kind: 'accepted'; readonly instanceId: string }
  /** 2xx without an instance ID: an instance for this claim already exists. */
  | { readonly kind: 'duplicate' }
  /** `503 { code: "jobs_paused" | "job_disabled" }`. */
  | { readonly kind: 'disabled'; readonly code: JobsUnavailableCode }
  /** Any other non-2xx, timeout, network error, or missing configuration. */
  | { readonly kind: 'failed' };

export type DispatchModuleLessonsToWorkerDeps = {
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
 * Sends `POST /v1/module-lessons/start` for a provisionally claimed module
 * (design note, Decision 4, App handling). The caller reverts the claim on
 * `disabled` or `failed`. Never throws.
 */
export async function dispatchModuleLessonsToWorker(
  input: ModuleLessonsDispatchInput,
  deps: DispatchModuleLessonsToWorkerDeps = {},
): Promise<ModuleLessonsDispatchResult> {
  const send = deps.send ?? sendJobsWorkerCommand;
  const log = deps.log ?? logger;
  const context = {
    planId: input.planId,
    moduleId: input.moduleId,
    userId: input.userId,
    correlationId: input.correlationId,
  };

  try {
    const config = deps.config?.() ?? {
      url: jobsWorkerEnv.url,
      signingSecret: jobsWorkerEnv.signingSecret,
    };
    const command: ModuleLessonsStartCommand = {
      v: 1,
      planId: input.planId,
      moduleId: input.moduleId,
      userId: input.userId,
      batchRequestId: input.batchRequestId,
      correlationId: input.correlationId,
      ...(input.modelOverride ? { modelOverride: input.modelOverride } : {}),
    };
    const result = await send(JOBS_COMMAND_PATHS.moduleLessonsStart, command, {
      config,
    });

    if (result.kind === 'accepted') {
      const instanceId = readInstanceId(result.body);
      log.info(
        { ...context, status: result.status, instanceId },
        instanceId
          ? 'Module lesson generation handed to the jobs Worker'
          : 'Jobs Worker already has a module lessons instance for this claim',
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
      'Jobs Worker did not accept module lesson generation',
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
      'Failed to send module lesson generation to the jobs Worker',
    );
    return { kind: 'failed' };
  }
}
