import type { JobSwitchVars } from './env';
import type { SubscriptionTier } from '@/shared/types/billing.types';

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

/** Tiers with a `GROUNDED_GENERATION_<TIER>` switch. */
export const GROUNDED_GENERATION_TIERS = [
  'free',
  'starter',
  'pro',
] as const satisfies readonly SubscriptionTier[];

/**
 * Grounded generation runs for a tier only when its switch is `true`; absent
 * means off. `JOBS_PAUSED` does not apply: the job's own switch gates the run.
 */
export function isGroundedGenerationEnabled(
  env: JobSwitchVars,
  tier: SubscriptionTier,
): boolean {
  return toBoolean(env[`GROUNDED_GENERATION_${toUpperTier(tier)}`], false);
}

/** The Worker's value for the app's `grounded-generation` flag. */
export function groundedGenerationTiers(
  env: JobSwitchVars,
): SubscriptionTier[] {
  return GROUNDED_GENERATION_TIERS.filter((tier) =>
    isGroundedGenerationEnabled(env, tier),
  );
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

function toUpperTier(tier: SubscriptionTier): Uppercase<SubscriptionTier> {
  return tier.toUpperCase() as Uppercase<SubscriptionTier>;
}
