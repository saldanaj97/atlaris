import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { aiTimeoutEnv } from '@/lib/config/env';

const TIMEOUT_ENV_KEYS = [
  'AI_TIMEOUT_BASE_MS',
  'AI_TIMEOUT_EXTENSION_MS',
  'AI_TIMEOUT_EXTENSION_THRESHOLD_MS',
] as const;

const originalTimeoutEnv = TIMEOUT_ENV_KEYS.reduce(
  (acc, key) => {
    acc[key] = process.env[key];
    return acc;
  },
  {} as Record<(typeof TIMEOUT_ENV_KEYS)[number], string | undefined>
);

function clearTimeoutEnv(): void {
  for (const key of TIMEOUT_ENV_KEYS) {
    delete process.env[key];
  }
}

describe('aiTimeoutEnv', () => {
  beforeEach(() => {
    clearTimeoutEnv();
  });

  afterEach(() => {
    clearTimeoutEnv();
    for (const key of TIMEOUT_ENV_KEYS) {
      const value = originalTimeoutEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('uses sane defaults when env vars are absent', () => {
    expect(aiTimeoutEnv.baseMs).toBe(30_000);
    expect(aiTimeoutEnv.extensionMs).toBe(15_000);
    expect(aiTimeoutEnv.extensionThresholdMs).toBe(25_000);
  });

  it('honors explicit overrides for all timeout knobs', () => {
    process.env.AI_TIMEOUT_BASE_MS = '45000';
    process.env.AI_TIMEOUT_EXTENSION_MS = '17000';
    process.env.AI_TIMEOUT_EXTENSION_THRESHOLD_MS = '33000';

    expect(aiTimeoutEnv.baseMs).toBe(45_000);
    expect(aiTimeoutEnv.extensionMs).toBe(17_000);
    expect(aiTimeoutEnv.extensionThresholdMs).toBe(33_000);
  });

  it('falls back to base - 5000 when threshold override is missing', () => {
    process.env.AI_TIMEOUT_BASE_MS = '50000';

    expect(aiTimeoutEnv.baseMs).toBe(50_000);
    expect(aiTimeoutEnv.extensionThresholdMs).toBe(45_000);
  });
});
