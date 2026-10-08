import {
  formatPlan,
  parseEnvironmentOutput,
  parseSyncArgs,
  planSync,
  readWranglerVarNames,
  SecretsSyncUsageError,
  SYNC_TARGETS,
} from '../../../scripts/secrets/sync';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');

describe('parseSyncArgs', () => {
  it('resolves each provider and environment to its 1Password Environment', () => {
    expect(parseSyncArgs(['cloudflare', 'staging']).target).toBe(
      SYNC_TARGETS['cloudflare staging'],
    );
    expect(
      parseSyncArgs(['--', 'vercel', 'production', '--dry-run']),
    ).toMatchObject({
      target: SYNC_TARGETS['vercel production'],
      dryRun: true,
      redeploy: false,
      yes: false,
    });
  });

  it('accepts a branch and redeploy for Vercel preview', () => {
    expect(
      parseSyncArgs([
        'vercel',
        'preview',
        '--git-branch',
        'develop',
        '--redeploy',
      ]),
    ).toMatchObject({ gitBranch: 'develop', redeploy: true });
  });

  it.each([
    [[]],
    [['cloudflare']],
    [['cloudflare', 'preview']],
    [['aws', 'production']],
    [['cloudflare', 'staging', '--force']],
    [['vercel', 'preview', '--git-branch']],
    [['cloudflare', 'staging', '--git-branch', 'develop']],
    [['cloudflare', 'production', '--redeploy']],
    [['vercel', 'preview', '--redeploy']],
  ])('rejects %j', (argv) => {
    expect(() => parseSyncArgs(argv)).toThrow(SecretsSyncUsageError);
  });
});

describe('parseEnvironmentOutput', () => {
  it('parses KEY=value lines, including quoted values', () => {
    expect(
      parseEnvironmentOutput('A_KEY=one\nRESEND_FROM="Atlaris <a@b.c>"\n'),
    ).toEqual({ A_KEY: 'one', RESEND_FROM: 'Atlaris <a@b.c>' });
  });

  it('rejects names that are not environment variable names, without echoing values', () => {
    const run = () => parseEnvironmentOutput('lower=secret-value\n');
    expect(run).toThrow(SecretsSyncUsageError);
    expect(run).toThrow(/lower/);
    expect(run).not.toThrow(/secret-value/);
  });
});

describe('readWranglerVarNames', () => {
  it('reads the vars of one Wrangler environment from the real config', () => {
    const config = readFileSync(
      join(REPO_ROOT, 'workers', 'jobs', 'wrangler.jsonc'),
      'utf8',
    );
    const staging = readWranglerVarNames(config, 'staging');
    expect(staging.has('RESEND_FROM')).toBe(true);
    expect(staging.has('JOBS_SIGNING_SECRET')).toBe(false);
    expect(readWranglerVarNames(config, 'missing').size).toBe(0);
  });
});

describe('planSync', () => {
  it('adds new names and updates existing ones for a Worker', () => {
    const plan = planSync({
      provider: 'cloudflare',
      names: ['OPENROUTER_API_KEY', 'JOBS_SIGNING_SECRET'],
      existing: new Set(['JOBS_SIGNING_SECRET']),
      wranglerVars: new Set(),
    });
    expect(plan).toEqual([
      { name: 'JOBS_SIGNING_SECRET', action: 'update' },
      { name: 'OPENROUTER_API_KEY', action: 'add' },
    ]);
  });

  it('never writes build secrets, job switches, or wrangler vars to a Worker', () => {
    const plan = planSync({
      provider: 'cloudflare',
      names: [
        'SENTRY_AUTH_TOKEN',
        'JOBS_PAUSED',
        'JOB_MODULE_LESSONS_ENABLED',
        'RESEND_FROM',
      ],
      existing: new Set(),
      wranglerVars: new Set(['RESEND_FROM']),
    });
    expect(plan.map((entry) => entry.action)).toEqual([
      'skip',
      'skip',
      'skip',
      'skip',
    ]);
  });

  it('never writes integration-managed or reserved names', () => {
    const plan = planSync({
      provider: 'vercel',
      names: [
        'POSTGRES_URL',
        'SUPABASE_SECRET_KEY',
        'NEXT_PUBLIC_SUPABASE_URL',
        'VERCEL_BYPASS_PROTECTION_TOKEN',
        'FLAGS',
        'CUSTOM_OWNED',
        'FLAGS_SECRET',
      ],
      existing: new Set(),
      integrationOwned: new Set(['CUSTOM_OWNED']),
    });
    expect(
      plan
        .filter((entry) => entry.action !== 'skip')
        .map((entry) => entry.name),
    ).toEqual(['FLAGS_SECRET']);
  });

  it('formats names and reasons but never values', () => {
    expect(
      formatPlan([
        { name: 'A', action: 'add' },
        { name: 'POSTGRES_URL', action: 'skip', reason: 'integration' },
      ]),
    ).toBe('  add    A\n  skip   POSTGRES_URL  (integration)');
  });
});
