import {
  createServerEnvAccess,
  type EnvSource,
  EnvValidationError,
  getProcessEnvSource,
  type ServerEnvAccess,
} from '@/lib/config/env/shared';

/**
 * App-side settings for signed commands to the Cloudflare jobs Worker
 * (docs/architecture/cloudflare-jobs-runtime.md, Decision 4).
 */
interface JobsWorkerEnv {
  /** Worker origin, e.g. `https://workers-staging.atlaris.app`. */
  readonly url: string | undefined;
  /** HMAC key shared with the Worker's `JOBS_SIGNING_SECRET`. */
  readonly signingSecret: string | undefined;
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
  };
}

export function createJobsWorkerEnvForTests(env: EnvSource): JobsWorkerEnv {
  return createJobsWorkerEnv(createServerEnvAccess(() => env));
}

export const jobsWorkerEnv = createJobsWorkerEnv(
  createServerEnvAccess(getProcessEnvSource),
);
