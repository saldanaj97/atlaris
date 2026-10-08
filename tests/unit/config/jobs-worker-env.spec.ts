import { createJobsWorkerEnvForTests } from '@/lib/config/env/jobs-worker';
import { EnvValidationError } from '@/lib/config/env/shared';
import { describe, expect, it } from 'vitest';

const base = { NODE_ENV: 'test' };

describe('jobsWorkerEnv', () => {
  it('defaults regeneration to the Vercel runtime', () => {
    expect(createJobsWorkerEnvForTests(base).regenerationRuntime).toBe(
      'vercel',
    );
    expect(
      createJobsWorkerEnvForTests({ ...base, REGENERATION_RUNTIME: '  ' })
        .regenerationRuntime,
    ).toBe('vercel');
  });

  it.each([
    ['cloudflare', 'cloudflare'],
    [' Cloudflare ', 'cloudflare'],
    ['vercel', 'vercel'],
  ])('reads REGENERATION_RUNTIME=%j', (value, expected) => {
    expect(
      createJobsWorkerEnvForTests({ ...base, REGENERATION_RUNTIME: value })
        .regenerationRuntime,
    ).toBe(expected);
  });

  it('rejects an unknown runtime instead of silently falling back', () => {
    expect(
      () =>
        createJobsWorkerEnvForTests({ ...base, REGENERATION_RUNTIME: 'cf' })
          .regenerationRuntime,
    ).toThrow(EnvValidationError);
  });

  it('defaults module lessons to the Vercel runtime', () => {
    expect(createJobsWorkerEnvForTests(base).moduleLessonsRuntime).toBe(
      'vercel',
    );
  });

  it.each([
    ['cloudflare', 'cloudflare'],
    [' Cloudflare ', 'cloudflare'],
    ['vercel', 'vercel'],
  ])('reads MODULE_LESSONS_RUNTIME=%j', (value, expected) => {
    expect(
      createJobsWorkerEnvForTests({ ...base, MODULE_LESSONS_RUNTIME: value })
        .moduleLessonsRuntime,
    ).toBe(expected);
  });

  it('rejects an unknown module lessons runtime', () => {
    const read = () =>
      createJobsWorkerEnvForTests({ ...base, MODULE_LESSONS_RUNTIME: 'cf' })
        .moduleLessonsRuntime;
    expect(read).toThrow(EnvValidationError);
    expect(read).toThrow(/^MODULE_LESSONS_RUNTIME must be one of/);
  });

  it('reads each runtime independently', () => {
    const env = createJobsWorkerEnvForTests({
      ...base,
      MODULE_LESSONS_RUNTIME: 'cloudflare',
    });
    expect(env.moduleLessonsRuntime).toBe('cloudflare');
    expect(env.regenerationRuntime).toBe('vercel');
  });

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
