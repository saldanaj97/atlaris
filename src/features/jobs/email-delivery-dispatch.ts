import type { EmailNotificationDeliveryRunAction } from '@/features/notifications/email/workflows/email-notification-delivery.types';
import type { EmailNotificationDeliveryRunKind } from '@supabase/schema';

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

export type EmailDeliveryDispatchInput = {
  readonly runKind: EmailNotificationDeliveryRunKind;
  readonly schedulerDateUtc: string;
  readonly action: EmailNotificationDeliveryRunAction;
};

export type EmailDeliveryDispatchOutcome =
  | 'started'
  | 'already_running'
  | 'already_paused'
  | 'already_completed'
  | 'failed_requires_resume'
  | 'needs_review';

export type EmailDeliveryDispatchResult =
  /** The Worker started a run or reported the existing one. */
  | {
      readonly kind: 'accepted';
      readonly outcome: EmailDeliveryDispatchOutcome;
      readonly runId: string | null;
      readonly instanceId: string | null;
    }
  /** `409 { code: "invalid_run_state" }`: the action does not fit the run's state. */
  | { readonly kind: 'invalid_run_state' }
  /** `503 { code: "jobs_paused" | "job_disabled" }`. */
  | { readonly kind: 'disabled'; readonly code: JobsUnavailableCode }
  /** Any other non-2xx, timeout, network error, or missing configuration. */
  | { readonly kind: 'failed' };

export type DispatchEmailDeliveryToWorkerDeps = {
  readonly send?: typeof sendJobsWorkerCommand;
  readonly config?: () => JobsWorkerClientConfig;
  readonly log?: Pick<typeof logger, 'info' | 'warn' | 'error'>;
};

const UNAVAILABLE_CODES: readonly JobsUnavailableCode[] = [
  'jobs_paused',
  'job_disabled',
];

function readString(body: unknown, key: string): string | null {
  if (typeof body === 'object' && body !== null && key in body) {
    const value = (body as Record<string, unknown>)[key];
    return typeof value === 'string' && value.length > 0 ? value : null;
  }
  return null;
}

function outcomeFor(
  body: unknown,
  status: number,
): EmailDeliveryDispatchOutcome {
  if (status === 202) {
    return 'started';
  }
  switch (readString(body, 'status')) {
    case 'completed':
      return 'already_completed';
    case 'paused':
      return 'already_paused';
    case 'failed':
      return 'failed_requires_resume';
    case 'needs_review':
      return 'needs_review';
    default:
      return 'already_running';
  }
}

/**
 * Sends `POST /v1/email-delivery/runs` for a manual `start`, `resume`, or
 * `replay_reviewed` of one logical run. The Worker reserves the run and
 * starts its Workflow instance. Never throws.
 */
export async function dispatchEmailDeliveryToWorker(
  input: EmailDeliveryDispatchInput,
  deps: DispatchEmailDeliveryToWorkerDeps = {},
): Promise<EmailDeliveryDispatchResult> {
  const send = deps.send ?? sendJobsWorkerCommand;
  const log = deps.log ?? logger;
  const context = {
    source: 'email_notifications',
    runKind: input.runKind,
    schedulerDateUtc: input.schedulerDateUtc,
    action: input.action,
  };

  try {
    const config = deps.config?.() ?? {
      url: jobsWorkerEnv.url,
      signingSecret: jobsWorkerEnv.signingSecret,
    };
    const result = await send(
      JOBS_COMMAND_PATHS.emailDeliveryRuns,
      { v: 1, ...input },
      { config },
    );

    if (result.kind === 'accepted') {
      const runId = readString(result.body, 'runId');
      const instanceId = readString(result.body, 'instanceId');
      log.info(
        { ...context, status: result.status, runId, instanceId },
        'Email notification delivery handed to the jobs Worker',
      );
      return {
        kind: 'accepted',
        outcome: outcomeFor(result.body, result.status),
        runId,
        instanceId,
      };
    }

    log.warn(
      {
        ...context,
        outcome: result.kind,
        ...(result.kind === 'rejected'
          ? { status: result.status, code: result.code }
          : { reason: result.reason }),
      },
      'Jobs Worker did not accept email notification delivery',
    );

    if (result.kind === 'rejected') {
      if (result.status === 409 && result.code === 'invalid_run_state') {
        return { kind: 'invalid_run_state' };
      }
      if (result.status === 503) {
        const code = UNAVAILABLE_CODES.find(
          (candidate) => candidate === result.code,
        );
        if (code) {
          return { kind: 'disabled', code };
        }
      }
    }
    return { kind: 'failed' };
  } catch (error) {
    log.error(
      { ...context, err: error },
      'Failed to send email notification delivery to the jobs Worker',
    );
    return { kind: 'failed' };
  }
}
