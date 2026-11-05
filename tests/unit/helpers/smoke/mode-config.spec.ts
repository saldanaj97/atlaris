import type { SmokeStatePayload } from '@tests/helpers/smoke/state-file';

import { LOCAL_PRODUCT_TESTING_SEED_AUTH_USER_ID } from '@/lib/config/local-product-testing';
import {
  buildAnonModeLayer,
  buildAuthModeLayer,
  buildWorkerModeLayer,
  mergeSmokeProcessEnv,
  parseSmokeAppMode,
  SMOKE_ANON_PORT,
  SMOKE_AUTH_PORT,
  smokeAnonAppUrl,
  smokeAuthAppUrl,
  smokeWorkerUrl,
} from '@tests/helpers/smoke/mode-config';
import { describe, expect, it } from 'vitest';

const INVALID_MODE_ERROR =
  'Missing or invalid --mode. Use --mode=anon, --mode=auth, or --mode=worker.';

const FAKE_STATE: SmokeStatePayload = {
  POSTGRES_URL: 'postgresql://postgres:pw@127.0.0.1:54399/atlaris_test',
  POSTGRES_URL_NON_POOLING:
    'postgresql://postgres:pw@127.0.0.1:54399/atlaris_test',
};

describe('smoke mode-config', () => {
  it('buildAnonModeLayer forces empty DEV_AUTH_USER_ID and LOCAL_PRODUCT_TESTING=false', () => {
    const layer = buildAnonModeLayer(FAKE_STATE);
    expect(layer.DEV_AUTH_USER_ID).toBe('');
    expect(layer.LOCAL_PRODUCT_TESTING).toBe('false');
    expect(layer.ENABLE_SENTRY).toBe('false');
    expect(layer.NEXT_PUBLIC_ENABLE_SENTRY).toBe('false');
    expect(layer.PORT).toBe(String(SMOKE_ANON_PORT));
    expect(layer.APP_URL).toBe(smokeAnonAppUrl());
    expect(layer.POSTGRES_URL).toBe(FAKE_STATE.POSTGRES_URL);
  });

  it('buildAuthModeLayer sets seeded auth id and local AI mocks', () => {
    const layer = buildAuthModeLayer(FAKE_STATE);
    expect(layer.DEV_AUTH_USER_ID).toBe(
      LOCAL_PRODUCT_TESTING_SEED_AUTH_USER_ID,
    );
    expect(layer.LOCAL_PRODUCT_TESTING).toBe('true');
    expect(layer.ENABLE_SENTRY).toBe('false');
    expect(layer.NEXT_PUBLIC_ENABLE_SENTRY).toBe('false');
    expect(layer.AI_PROVIDER).toBe('mock');
    expect(layer.MOCK_AI_SCENARIO).toBe('success');
    expect(layer.MOCK_GENERATION_DELAY_MS).toBe('0');
    expect(layer.MOCK_GENERATION_FAILURE_RATE).toBe('0');
    expect(layer.PORT).toBe(String(SMOKE_AUTH_PORT));
    expect(layer.APP_URL).toBe(smokeAuthAppUrl());
  });

  it('mergeSmokeProcessEnv overlays mode and keeps NODE_ENV development', () => {
    const base: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
      SOME_OTHER_VAR: 'keep-me',
    };
    const merged = mergeSmokeProcessEnv(base, buildAnonModeLayer(FAKE_STATE));
    expect(merged.NODE_ENV).toBe('development');
    expect(merged.DEV_AUTH_USER_ID).toBe('');
    expect(merged.SOME_OTHER_VAR).toBe('keep-me');
  });

  it('mergeSmokeProcessEnv drops NO_COLOR when FORCE_COLOR is also set (Node warning)', () => {
    const base: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
      FORCE_COLOR: '1',
      NO_COLOR: '1',
      SOME_OTHER_VAR: 'keep-me',
    };
    const merged = mergeSmokeProcessEnv(base, buildAnonModeLayer(FAKE_STATE));
    expect(merged.FORCE_COLOR).toBe('1');
    expect(merged.NO_COLOR).toBeUndefined();
    expect(merged.SOME_OTHER_VAR).toBe('keep-me');
  });

  it('mergeSmokeProcessEnv overwrites parent smoke flags with anon-mode defaults', () => {
    const base: NodeJS.ProcessEnv = {
      AI_PROVIDER: 'openrouter',
      DEV_AUTH_USER_ID: 'should-not-survive',
      ENABLE_SENTRY: 'true',
      MOCK_AI_SCENARIO: 'timeout',
      MOCK_GENERATION_DELAY_MS: '7000',
      MOCK_GENERATION_FAILURE_RATE: '1',
      NEXT_PUBLIC_ENABLE_SENTRY: 'true',
      NODE_ENV: 'test',
    };

    const merged = mergeSmokeProcessEnv(base, buildAnonModeLayer(FAKE_STATE));

    expect(merged.DEV_AUTH_USER_ID).toBe('');
    expect(merged.ENABLE_SENTRY).toBe('false');
    expect(merged.NEXT_PUBLIC_ENABLE_SENTRY).toBe('false');
    expect(merged.AI_PROVIDER).toBe('');
    expect(merged.MOCK_AI_SCENARIO).toBe('success');
    expect(merged.MOCK_GENERATION_DELAY_MS).toBe('0');
    expect(merged.MOCK_GENERATION_FAILURE_RATE).toBe('0');
  });

  it('mergeSmokeProcessEnv preserves unrelated parent MOCK_* controls', () => {
    const base: NodeJS.ProcessEnv = {
      MOCK_AI_SCENARIO: 'timeout',
      MOCK_FUTURE_FAILURE_MODE: 'enabled',
      NODE_ENV: 'test',
    };

    const merged = mergeSmokeProcessEnv(base, buildAuthModeLayer(FAKE_STATE));

    expect(merged.MOCK_AI_SCENARIO).toBe('success');
    expect(merged.MOCK_FUTURE_FAILURE_MODE).toBe('enabled');
  });

  it('parseSmokeAppMode accepts anon', () => {
    expect(parseSmokeAppMode(['node', 'x', '--mode=anon'])).toBe('anon');
  });

  it('parseSmokeAppMode accepts auth', () => {
    expect(parseSmokeAppMode(['--mode=auth'])).toBe('auth');
  });

  it('parseSmokeAppMode accepts worker', () => {
    expect(parseSmokeAppMode(['--mode=worker'])).toBe('worker');
  });

  it('auth app and Worker layers share a signing secret and the Worker URL', () => {
    const auth = buildAuthModeLayer(FAKE_STATE);
    const worker = buildWorkerModeLayer(FAKE_STATE);

    expect(auth.JOBS_WORKER_URL).toBe(smokeWorkerUrl());
    expect(auth.JOBS_SIGNING_SECRET).toBeTruthy();
    expect(worker.JOBS_SIGNING_SECRET).toBe(auth.JOBS_SIGNING_SECRET);
    expect(worker.AI_PROVIDER).toBe('mock');
    expect(worker.CLOUDFLARE_INCLUDE_PROCESS_ENV).toBe('true');
    expect(
      worker.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE,
    ).toBe(FAKE_STATE.POSTGRES_URL_NON_POOLING);
  });

  it('slows mock generation only in the Worker, which runs it for auth smoke', () => {
    expect(
      Number(buildWorkerModeLayer(FAKE_STATE).MOCK_GENERATION_DELAY_MS),
    ).toBeGreaterThan(0);
    expect(buildAuthModeLayer(FAKE_STATE).MOCK_GENERATION_DELAY_MS).toBe('0');
    expect(buildAnonModeLayer(FAKE_STATE).MOCK_GENERATION_DELAY_MS).toBe('0');
  });

  it('anon layer leaves the jobs Worker unconfigured even when the parent sets it', () => {
    const merged = mergeSmokeProcessEnv(
      {
        NODE_ENV: 'test',
        JOBS_WORKER_URL: 'https://workers.atlaris.app',
        JOBS_SIGNING_SECRET: 'parent-secret',
      },
      buildAnonModeLayer(FAKE_STATE),
    );

    expect(merged.JOBS_WORKER_URL).toBeUndefined();
    expect(merged.JOBS_SIGNING_SECRET).toBeUndefined();
  });

  it('buildWorkerModeLayer refuses a non-local database', () => {
    expect(() =>
      buildWorkerModeLayer({
        POSTGRES_URL: 'postgresql://u:p@db.example.com:5432/app',
        POSTGRES_URL_NON_POOLING: 'postgresql://u:p@db.example.com:5432/app',
      }),
    ).toThrow(/non-local database/);
  });

  it('parseSmokeAppMode throws when mode is invalid', () => {
    expect(() => parseSmokeAppMode(['--mode=invalid'])).toThrow(
      INVALID_MODE_ERROR,
    );
  });

  it('parseSmokeAppMode throws when mode is missing', () => {
    expect(() => parseSmokeAppMode([])).toThrow(INVALID_MODE_ERROR);
  });

  it('parseSmokeAppMode rejects an empty mode value', () => {
    expect(() => parseSmokeAppMode(['--mode='])).toThrow(INVALID_MODE_ERROR);
  });

  it('parseSmokeAppMode rejects space-separated mode flags', () => {
    expect(() => parseSmokeAppMode(['--mode', 'anon'])).toThrow(
      INVALID_MODE_ERROR,
    );
  });

  it('parseSmokeAppMode treats flag names as case-sensitive', () => {
    expect(() => parseSmokeAppMode(['--MODE=anon'])).toThrow(
      INVALID_MODE_ERROR,
    );
  });

  it('parseSmokeAppMode uses the first duplicate mode flag', () => {
    expect(parseSmokeAppMode(['--mode=anon', '--mode=auth'])).toBe('anon');
  });
});
