import { createJobsWorkerEnvForTests } from '@/lib/config/env/jobs-worker';
import { EnvValidationError } from '@/lib/config/env/shared';
import { describe, expect, it } from 'vitest';

const base = { NODE_ENV: 'test' };

describe('jobsWorkerEnv', () => {
  it('normalizes JOBS_WORKER_URL to its origin', () => {
    expect(
      createJobsWorkerEnvForTests({
        ...base,
        JOBS_WORKER_URL: 'https://workers-staging.atlaris.app/',
      }).url,
    ).toBe('https://workers-staging.atlaris.app');
    expect(createJobsWorkerEnvForTests(base).url).toBeUndefined();
  });

  it.each(['not a url', 'ftp://workers.atlaris.app'])(
    'rejects JOBS_WORKER_URL=%j',
    (value) => {
      expect(
        () =>
          createJobsWorkerEnvForTests({ ...base, JOBS_WORKER_URL: value }).url,
      ).toThrow(EnvValidationError);
    },
  );

  it('reads the signing secret', () => {
    expect(
      createJobsWorkerEnvForTests({ ...base, JOBS_SIGNING_SECRET: 'secret' })
        .signingSecret,
    ).toBe('secret');
  });
});
