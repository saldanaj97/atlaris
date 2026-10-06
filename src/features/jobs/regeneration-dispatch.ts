import type { RegenerationDispatchInput } from '@/features/plans/regeneration-orchestration/deps';

import { jobsWorkerEnv } from '@/lib/config/env/jobs-worker';
import {
  sendJobsWorkerCommand,
  type JobsWorkerClientConfig,
} from '@/lib/jobs-worker/client';
import {
  JOBS_COMMAND_PATHS,
  type RegenerationEnqueueCommand,
} from '@/lib/jobs-worker/contract';
import { logger } from '@/lib/logging/logger';

export type DispatchRegenerationToWorkerDeps = {
  readonly send?: typeof sendJobsWorkerCommand;
  readonly config?: () => JobsWorkerClientConfig;
  readonly log?: Pick<typeof logger, 'info' | 'warn' | 'error'>;
};

/**
 * Sends `POST /v1/regeneration/enqueue` for an inserted `job_queue` row. Any
 * outcome other than 2xx leaves the row `pending`; the Worker's 15-minute
 * sweep re-sends it (design note, Decision 4, App handling). Never throws.
 */
export async function dispatchRegenerationToWorker(
  input: RegenerationDispatchInput,
  deps: DispatchRegenerationToWorkerDeps = {},
): Promise<void> {
  const send = deps.send ?? sendJobsWorkerCommand;
  const log = deps.log ?? logger;
  const context = {
    jobId: input.jobId,
    planId: input.planId,
    userId: input.userId,
  };

  try {
    const config = deps.config?.() ?? {
      url: jobsWorkerEnv.url,
      signingSecret: jobsWorkerEnv.signingSecret,
    };
    const command: RegenerationEnqueueCommand = { v: 1, jobId: input.jobId };
    const result = await send(JOBS_COMMAND_PATHS.regenerationEnqueue, command, {
      config,
    });

    if (result.kind === 'accepted') {
      log.info(
        { ...context, status: result.status },
        'Plan regeneration handed to the jobs Worker',
      );
      return;
    }

    log.warn(
      {
        ...context,
        outcome: result.kind,
        ...(result.kind === 'rejected'
          ? { status: result.status, code: result.code }
          : { reason: result.reason }),
      },
      'Jobs Worker did not accept plan regeneration; job stays pending for the sweep',
    );
  } catch (error) {
    log.error(
      { ...context, err: error },
      'Failed to send plan regeneration to the jobs Worker; job stays pending for the sweep',
    );
  }
}
