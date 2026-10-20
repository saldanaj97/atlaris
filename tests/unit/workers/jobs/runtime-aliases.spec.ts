import {
  FLAG_SWITCHES,
  flag,
} from '../../../../workers/jobs/src/runtime/flags-next';
import { vercelAdapter } from '../../../../workers/jobs/src/runtime/flags-sdk-vercel';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('flags/next alias', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // src/flags.ts declares every flag at import, so an unmapped key makes the
  // Worker throw on startup and Cloudflare rejects the upload.
  it('maps every flag key declared in src/flags.ts', () => {
    const source = readFileSync(
      join(import.meta.dirname, '../../../../src/flags.ts'),
      'utf8',
    );
    const keys = [...source.matchAll(/key: '([^']+)'/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((key) => !(key! in FLAG_SWITCHES))).toEqual([]);
  });

  it('keeps launch-waitlist off on the Worker', async () => {
    await expect(flag<boolean>({ key: 'launch-waitlist' })()).resolves.toBe(
      false,
    );
  });

  it('maps module-lesson-generation to JOB_MODULE_LESSONS_ENABLED', async () => {
    const enabled = flag<boolean>({ key: 'module-lesson-generation' });

    vi.stubEnv('JOB_MODULE_LESSONS_ENABLED', 'true');
    await expect(enabled()).resolves.toBe(true);

    vi.stubEnv('JOBS_PAUSED', 'true');
    await expect(enabled()).resolves.toBe(false);
  });

  it('maps email-notification-delivery to JOB_EMAIL_DELIVERY_ENABLED, off when absent', async () => {
    const enabled = flag<boolean>({ key: 'email-notification-delivery' });

    vi.stubEnv('JOB_EMAIL_DELIVERY_ENABLED', '');
    await expect(enabled()).resolves.toBe(false);

    vi.stubEnv('JOB_EMAIL_DELIVERY_ENABLED', 'true');
    await expect(enabled()).resolves.toBe(true);
  });

  it('maps grounded-generation to the per-tier switches, off when unset', async () => {
    const tiers = flag<string[]>({ key: 'grounded-generation' });

    await expect(tiers()).resolves.toEqual([]);

    vi.stubEnv('GROUNDED_GENERATION_STARTER', 'true');
    vi.stubEnv('GROUNDED_GENERATION_PRO', 'true');
    await expect(tiers()).resolves.toEqual(['starter', 'pro']);
  });

  it('keeps maintenance-mode off on the Worker', async () => {
    vi.stubEnv('MAINTENANCE_MODE', 'true');
    await expect(flag<boolean>({ key: 'maintenance-mode' })()).resolves.toBe(
      false,
    );
  });

  it('refuses a flag key with no Worker switch', () => {
    expect(() => flag({ key: 'new-flag' })).toThrow(/no Worker switch/);
  });

  it('never lets the Vercel adapter decide', () => {
    expect(() => vercelAdapter().decide()).toThrow(/not available/);
  });
});
