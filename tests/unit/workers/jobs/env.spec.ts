import {
  parseWorkerEnv,
  type WorkerEnv,
  WorkerEnvError,
} from '../../../../workers/jobs/src/env';
import { describe, expect, it } from 'vitest';

function makeEnv(overrides: Record<string, unknown> = {}): WorkerEnv {
  return {
    HYPERDRIVE: {
      connectionString: 'postgres://u:secret-pw@127.0.0.1:5432/db',
    },
    CF_VERSION_METADATA: { id: 'version-1', tag: '', timestamp: '' },
    NODE_ENV: 'production',
    WORKER_ENV: 'staging',
    APP_URL: 'https://example.test',
    SENTRY_DSN: '',
    LOG_LEVEL: 'info',
    ...overrides,
  } as unknown as WorkerEnv;
}

describe('parseWorkerEnv', () => {
  it('returns the runtime env object unchanged when valid', () => {
    const env = makeEnv({ JOBS_PAUSED: 'true', JOB_PLAN_CLEANUP_ENABLED: '1' });
    expect(parseWorkerEnv(env)).toBe(env);
  });

  it('names a missing Hyperdrive binding', () => {
    expect(() => parseWorkerEnv(makeEnv({ HYPERDRIVE: undefined }))).toThrow(
      new WorkerEnvError(['HYPERDRIVE']),
    );
  });

  it('names an unknown WORKER_ENV and missing version metadata together', () => {
    expect(() =>
      parseWorkerEnv(
        makeEnv({ WORKER_ENV: 'preview', CF_VERSION_METADATA: undefined }),
      ),
    ).toThrow(
      /CF_VERSION_METADATA, WORKER_ENV|WORKER_ENV, CF_VERSION_METADATA/,
    );
  });

  it('rejects a non-string job switch', () => {
    expect(() =>
      parseWorkerEnv(makeEnv({ JOB_REGENERATION_ENABLED: true })),
    ).toThrow(new WorkerEnvError(['JOB_REGENERATION_ENABLED']));
  });

  it('names invalid keys without echoing their values', () => {
    let caught: unknown;
    try {
      parseWorkerEnv(makeEnv({ WORKER_ENV: 'secret-pw' }));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(WorkerEnvError);
    expect((caught as Error).message).toBe(
      'Invalid Worker environment: WORKER_ENV',
    );
  });
});
