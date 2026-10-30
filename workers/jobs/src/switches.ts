import type { JobSwitchVars } from './env';

import { parallelEnv } from '@/lib/config/env/ai';
import { toBoolean } from '@/lib/config/env/shared';

/** Jobs with a `JOB_<NAME>_ENABLED` switch (design note, Decision 7). */
export const JOB_NAMES = [
  'PLAN_CLEANUP',
  'RETENTION_CLEANUP',
  'EMAIL_DELIVERY',
  'REGENERATION',
  'MODULE_LESSONS',
  'PLAN_GENERATION',
  'POSTHOG_DELETION',
] as const;

export type JobName = (typeof JOB_NAMES)[number];

/** `JOBS_PAUSED=true` pauses every job; absent means not paused. */
export function isJobsPaused(env: JobSwitchVars): boolean {
  return toBoolean(env.JOBS_PAUSED, false);
}

/** A job runs only when its switch is `true` and jobs are not paused. */
export function isJobEnabled(env: JobSwitchVars, job: JobName): boolean {
  return !isJobsPaused(env) && toBoolean(env[`JOB_${job}_ENABLED`], false);
}

/**
 * Plan research searches Parallel directly instead of using OpenRouter's
 * `web_search` tool (DEV-171) only when this switch is `true` and
 * `PARALLEL_API_KEY` is set; absent means off. Without the key the switch
 * stays off, so flipping it before the key is synced keeps research working.
 */
export function isDirectResearchEnabled(env: JobSwitchVars): boolean {
  return (
    toBoolean(env.PARALLEL_DIRECT_RESEARCH, false) &&
    Boolean(parallelEnv.apiKey)
  );
}
