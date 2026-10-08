import {
  createServerEnvAccess,
  type EnvSource,
  EnvValidationError,
  getProcessEnvSource,
  type ServerEnvAccess,
} from '@/lib/config/env/shared';

/**
 * Where queued plan regeneration runs. `vercel` (default) starts the Vercel
 * workflow at enqueue time; `cloudflare` sends the signed enqueue command to
 * the jobs Worker instead (docs/architecture/regeneration-worker-runbook.md).
 */
export type RegenerationRuntime = 'vercel' | 'cloudflare';

const REGENERATION_RUNTIMES: readonly RegenerationRuntime[] = [
  'vercel',
  'cloudflare',
];

/**
 * Where module lesson generation starts. `vercel` (default) starts the Vercel
 * workflow; `cloudflare` sends the signed start command to the jobs Worker
 * (docs/architecture/plan-generation-architecture.md, Cloudflare Workflow path).
 */
export type ModuleLessonsRuntime = RegenerationRuntime;

/**
 * App-side settings for signed commands to the Cloudflare jobs Worker
 * (docs/architecture/cloudflare-jobs-runtime.md, Decision 4).
 */
interface JobsWorkerEnv {
  /** Worker origin, e.g. `https://workers-staging.atlaris.app`. */
  readonly url: string | undefined;
  /** HMAC key shared with the Worker's `JOBS_SIGNING_SECRET`. */
  readonly signingSecret: string | undefined;
  readonly regenerationRuntime: RegenerationRuntime;
  readonly moduleLessonsRuntime: ModuleLessonsRuntime;
}

/** Unset means `vercel`; any other value than the two runtimes is a config error. */
function readRuntime(
  access: ServerEnvAccess,
  key: 'REGENERATION_RUNTIME' | 'MODULE_LESSONS_RUNTIME',
): RegenerationRuntime {
  const raw = access.getServerOptional(key);
  if (raw === undefined) {
    return 'vercel';
  }
  const normalized = raw.toLowerCase();
  const runtime = REGENERATION_RUNTIMES.find(
    (candidate) => candidate === normalized,
  );
  if (!runtime) {
    throw new EnvValidationError(
      `${key} must be one of: ${REGENERATION_RUNTIMES.join(', ')}`,
      key,
    );
  }
  return runtime;
}

function createJobsWorkerEnv(access: ServerEnvAccess): JobsWorkerEnv {
  return {
    get url(): string | undefined {
      const raw = access.getServerOptional('JOBS_WORKER_URL');
      if (raw === undefined) {
        return undefined;
      }
      let parsed: URL;
      try {
        parsed = new URL(raw);
      } catch {
        throw new EnvValidationError(
          'JOBS_WORKER_URL must be an absolute URL',
          'JOBS_WORKER_URL',
        );
      }
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new EnvValidationError(
          'JOBS_WORKER_URL must use http or https',
          'JOBS_WORKER_URL',
        );
      }
      return parsed.origin;
    },
    get signingSecret(): string | undefined {
      return access.getServerOptional('JOBS_SIGNING_SECRET');
    },
    get regenerationRuntime(): RegenerationRuntime {
      return readRuntime(access, 'REGENERATION_RUNTIME');
    },
    get moduleLessonsRuntime(): ModuleLessonsRuntime {
      return readRuntime(access, 'MODULE_LESSONS_RUNTIME');
    },
  };
}

export function createJobsWorkerEnvForTests(env: EnvSource): JobsWorkerEnv {
  return createJobsWorkerEnv(createServerEnvAccess(() => env));
}

export const jobsWorkerEnv = createJobsWorkerEnv(
  createServerEnvAccess(getProcessEnvSource),
);
