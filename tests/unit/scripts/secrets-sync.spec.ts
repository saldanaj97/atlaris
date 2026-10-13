import {
  formatPlan,
  parseEnvironmentOutput,
  parseSyncArgs,
  planSync,
  readWranglerVarNames,
  redeployVercel,
  SecretsSyncUsageError,
  SYNC_TARGETS,
  writtenKey,
} from '../../../scripts/secrets/sync';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Replaces the whole module, named and default exports alike, so no test can
// start a real `vercel` or `op` process.
vi.mock('node:child_process', () => {
  const spawn = vi.fn();
  return { spawn, default: { spawn } };
});

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

describe('writtenKey', () => {
  it('accepts a response that created or updated the variable', () => {
    expect(writtenKey('{"created":{"key":"APP_URL"}}', 'APP_URL')).toBe(true);
    expect(writtenKey('{"created":[{"key":"APP_URL"}]}', 'APP_URL')).toBe(true);
  });

  it('rejects failures, other keys, and non-JSON output', () => {
    expect(
      writtenKey('{"created":[],"failed":[{"error":{}}]}', 'APP_URL'),
    ).toBe(false);
    expect(writtenKey('{"created":{"key":"OTHER"}}', 'APP_URL')).toBe(false);
    expect(writtenKey('Error: forbidden', 'APP_URL')).toBe(false);
  });
});

describe.sequential('redeployVercel', () => {
  /** A child process that prints `stdout` and exits with `code`. */
  function fakeChild(code: number, stdout = '') {
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      stdin: { end: vi.fn() },
    });
    queueMicrotask(() => {
      if (stdout) child.stdout.emit('data', Buffer.from(stdout));
      child.emit('close', code);
    });
    return child;
  }

  const deployments = JSON.stringify({
    deployments: [
      { url: 'building.vercel.app', state: 'BUILDING' },
      { url: 'ready.vercel.app', state: 'READY', createdAt: 0 },
    ],
  });

  afterEach(() => vi.restoreAllMocks());

  it('names the deployment and announces the build before streaming the redeploy', async () => {
    const events: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: string) => {
      events.push(line);
    });
    vi.mocked(spawn).mockImplementation(((command: string, args: string[]) => {
      events.push(`spawn ${command} ${args[0]}`);
      return args[0] === 'ls' ? fakeChild(0, deployments) : fakeChild(0);
    }) as unknown as typeof spawn);

    const code = await redeployVercel(
      parseSyncArgs(['vercel', 'production', '--redeploy']),
    );

    expect(code).toBe(0);
    expect(events).toEqual([
      '[secrets] Finding the latest ready production deployment…',
      'spawn vercel ls',
      '[secrets] Redeploying ready.vercel.app (created 1970-01-01T00:00:00.000Z) to production.',
      expect.stringMatching(/^\[secrets\] Building…/),
      'spawn vercel redeploy',
      '[secrets] Redeploy finished.',
    ]);
    expect(vi.mocked(spawn).mock.calls[1]).toEqual([
      'vercel',
      ['redeploy', 'ready.vercel.app', '--target', 'production'],
      expect.objectContaining({ stdio: ['ignore', 'inherit', 'inherit'] }),
    ]);
  });

  it('returns the redeploy exit code when the build fails', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    vi.mocked(spawn).mockImplementation(((_command: string, args: string[]) =>
      args[0] === 'ls'
        ? fakeChild(0, deployments)
        : fakeChild(2)) as unknown as typeof spawn);

    const code = await redeployVercel(
      parseSyncArgs([
        'vercel',
        'preview',
        '--git-branch',
        'develop',
        '--redeploy',
      ]),
    );

    expect(code).toBe(2);
    expect(error).toHaveBeenCalledWith('[secrets] Redeploy failed (exit 2).');
  });
});
