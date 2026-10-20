// Wrangler alias target for `flags/next` (design note, Runtime compatibility
// audit and Decision 7). Vercel Flags cannot be evaluated on workerd, so each
// app flag key resolves to a dashboard-managed Worker switch instead.
import type { JobSwitchVars } from '../env';

import {
  groundedGenerationTiers,
  isJobEnabled,
  type JobName,
} from '../switches';

/**
 * App flag key → Worker switch; `null` means always off on the Worker.
 * `GROUNDED_GENERATION` reads the per-tier `GROUNDED_GENERATION_<TIER>` switches.
 */
export const FLAG_SWITCHES: Readonly<
  Record<string, JobName | 'GROUNDED_GENERATION' | null>
> = {
  'email-notification-delivery': 'EMAIL_DELIVERY',
  'module-lesson-generation': 'MODULE_LESSONS',
  'grounded-generation': 'GROUNDED_GENERATION',
  // The Worker does not follow the app's maintenance mode (Decision 7).
  'maintenance-mode': null,
  // A user-traffic gate on the app; no job reads it.
  'launch-waitlist': null,
};

type FlagDeclaration = { readonly key: string };

/**
 * Same call shape as `flags/next`'s `flag()`: returns an async evaluator.
 * Switch variables live in `process.env` (populated from Worker vars).
 */
export function flag<T>(declaration: FlagDeclaration): () => Promise<T> {
  if (!(declaration.key in FLAG_SWITCHES)) {
    throw new Error(
      `Flag "${declaration.key}" has no Worker switch mapping (workers/jobs/src/runtime/flags-next.ts).`,
    );
  }
  const job = FLAG_SWITCHES[declaration.key];
  return async () => {
    const env = process.env as JobSwitchVars;
    if (job === null) return false as T;
    if (job === 'GROUNDED_GENERATION') return groundedGenerationTiers(env) as T;
    return isJobEnabled(env, job) as T;
  };
}
