import { JOB_NAMES, type JobName } from './switches';
import { z } from 'zod';

export type JobSwitchVars = {
  JOBS_PAUSED?: string;
} & Partial<Record<`JOB_${JobName}_ENABLED`, string>>;

/**
 * Bindings and vars from `wrangler.jsonc`, plus the deploy-time
 * `SENTRY_RELEASE` and the dashboard-managed job switches.
 */
export type WorkerEnv = Env & JobSwitchVars & { SENTRY_RELEASE?: string };

const optionalString = z.string().optional();

/**
 * Checks only what the app's env modules do not: bindings (objects, so never
 * in `process.env`), Worker-only vars, and the switches. App variables such
 * as APP_URL and LOG_LEVEL are parsed by `src/lib/config/env/*`.
 */
const workerEnvSchema = z.object({
  HYPERDRIVE: z.object({ connectionString: z.string().min(1) }),
  CF_VERSION_METADATA: z.object({ id: z.string().min(1) }),
  WORKER_ENV: z.enum(['development', 'staging', 'production']),
  SENTRY_DSN: z.string(),
  SENTRY_RELEASE: optionalString,
  JOBS_PAUSED: optionalString,
  ...Object.fromEntries(
    JOB_NAMES.map((job) => [`JOB_${job}_ENABLED`, optionalString]),
  ),
});

export class WorkerEnvError extends Error {
  constructor(keys: string[]) {
    super(`Invalid Worker environment: ${keys.join(', ')}`);
    this.name = 'WorkerEnvError';
  }
}

/** Returns `env` unchanged when valid; throws naming the bad keys, never values. */
export function parseWorkerEnv(env: WorkerEnv): WorkerEnv {
  const result = workerEnvSchema.safeParse(env);
  if (!result.success) {
    const keys = result.error.issues.map((issue) => issue.path.join('.'));
    throw new WorkerEnvError([...new Set(keys)]);
  }
  return env;
}
