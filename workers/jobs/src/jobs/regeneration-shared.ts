import type { JobSwitchVars } from '../env';
import type { RegenerationEnqueueCommand } from '@/lib/jobs-worker/contract';

import { isJobEnabled, isJobsPaused } from '../switches';

/** Body of every message on `atlaris-regeneration-<env>`. */
export type RegenerationQueueMessage = RegenerationEnqueueCommand;

export type RegenerationQueue = Pick<
  Queue<RegenerationQueueMessage>,
  'send' | 'sendBatch'
>;

export const REGENERATION_JOB_TAG = 'regeneration';

/** Sentry tags for every regeneration failure report (binding rules). */
export const REGENERATION_SENTRY_TAGS = {
  job: REGENERATION_JOB_TAG,
  runtime: 'cloudflare-worker',
} as const;

export type CaptureException = (
  error: unknown,
  context: {
    tags: typeof REGENERATION_SENTRY_TAGS;
    extra?: Record<string, unknown>;
  },
) => unknown;

export type RegenerationSwitchState = 'enabled' | 'paused' | 'disabled';

/** `JOBS_PAUSED` wins over the job switch; an absent switch means disabled. */
export function readRegenerationSwitch(
  env: JobSwitchVars,
): RegenerationSwitchState {
  if (isJobsPaused(env)) {
    return 'paused';
  }
  return isJobEnabled(env, 'REGENERATION') ? 'enabled' : 'disabled';
}
