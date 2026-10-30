import { JOB_NAMES, type JobName } from './switches';
import { z } from 'zod';

export type JobSwitchVars = {
  JOBS_PAUSED?: string;
  /** Plan research calls Parallel directly (DEV-171); unset is off. */
  PARALLEL_DIRECT_RESEARCH?: string;
} & Partial<Record<`JOB_${JobName}_ENABLED`, string>>;

/**
 * Bindings and vars from `cloudflare.config.ts`, plus the deploy-time
 * `SENTRY_RELEASE` and the dashboard-managed job switches.
 */
export type WorkerEnv = Env &
  JobSwitchVars & {
    SENTRY_RELEASE?: string;
    /** Accepted during signing-secret rotation (design note, Decision 4). */
    JOBS_SIGNING_SECRET_PREVIOUS?: string;
    /** Dashboard-managed; outside production only these addresses get email. */
    EMAIL_TEST_RECIPIENT_ALLOWLIST?: string;
    /** Production-only; synced from 1Password `atlaris-worker-production`. */
    POSTHOG_PERSONAL_API_KEY?: string;
  };

/** What flag evaluation needs: the Flagship binding and the environment attribute. */
export type FlagEnv = Pick<WorkerEnv, 'FLAGS' | 'WORKER_ENV'>;

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
  FLAGS: z.custom<Flagship>(
    (value) =>
      typeof value === 'object' &&
      value !== null &&
      'getBooleanDetails' in value,
  ),
  REGENERATION_QUEUE: z.custom<Queue>(
    (value) => typeof value === 'object' && value !== null && 'send' in value,
  ),
  JOBS_SIGNING_SECRET: optionalString,
  JOBS_SIGNING_SECRET_PREVIOUS: optionalString,
  EMAIL_DELIVERY_WORKFLOW: z.custom<Workflow>(
    (value) => typeof value === 'object' && value !== null && 'create' in value,
  ),
  MODULE_LESSONS_WORKFLOW: z.custom<Workflow>(
    (value) => typeof value === 'object' && value !== null && 'create' in value,
  ),
  PLAN_GENERATION_WORKFLOW: z.custom<Workflow>(
    (value) => typeof value === 'object' && value !== null && 'create' in value,
  ),
  EMAIL_TEST_RECIPIENT_ALLOWLIST: optionalString,
  POSTHOG_PERSONAL_API_KEY: optionalString,
  JOBS_PAUSED: optionalString,
  PARALLEL_DIRECT_RESEARCH: optionalString,
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
