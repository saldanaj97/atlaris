import type { JobSwitchVars } from './env';

import { toBoolean } from '@/lib/config/env/shared';

/** Jobs with a `JOB_<NAME>_ENABLED` switch (design note, Decision 7). */
export const JOB_NAMES = [
  'PLAN_CLEANUP',
  'RETENTION_CLEANUP',
  'EMAIL_DELIVERY',
  'REGENERATION',
  'MODULE_LESSONS',
  'PLAN_GENERATION',
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
