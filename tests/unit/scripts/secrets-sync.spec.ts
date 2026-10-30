import {
  applyCloudflare,
  cloudflareSecretNames,
  cloudflareSecretsPatch,
  formatPlan,
  environmentVariables,
  parseSecretNames,
  parseSyncArgs,
  planSync,
  readDeclaredVarNames,
  readEnvironment,
  redeployVercel,
  SecretsSyncUsageError,
  SYNC_TARGETS,
  writtenKey,
} from '../../../scripts/secrets/sync';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Replaces the whole module, named and default exports alike, so no test can
// start a real `cf`, `vercel`, or `op` process.
vi.mock('node:child_process', () => {
  const spawn = vi.fn();
  return { spawn, default: { spawn } };
});

/** A child process that prints `stdout`, `stderr`, and exits with `code`. */
function fakeChild(code: number, stdout = '', stderr = '') {
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: { end: vi.fn() },
  });
  queueMicrotask(() => {
    if (stdout) child.stdout.emit('data', Buffer.from(stdout));
    if (stderr) child.stderr.emit('data', Buffer.from(stderr));
    child.emit('close', code);
  });
  return child;
}

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

describe('environmentVariables', () => {
  it('keeps only variables the Environment added or changed', () => {
    expect(
      environmentVariables(
        {
          HOME: '/h',
          PATH: '/env-path',
          A_KEY: 'one',
          RESEND_FROM: 'Atlaris <a@b.c>',
        },
        { HOME: '/h', PATH: '/bin' },
      ),
    ).toEqual({
      PATH: '/env-path',
      A_KEY: 'one',
      RESEND_FROM: 'Atlaris <a@b.c>',
    });
  });

  it('rejects names that are not environment variable names, without echoing values', () => {
    const run = () => environmentVariables({ lower: 'secret-value' }, {});
    expect(run).toThrow(SecretsSyncUsageError);
    expect(run).toThrow(/lower/);
    expect(run).not.toThrow(/secret-value/);
  });
});

describe('readDeclaredVarNames', () => {
  it.each(['staging', 'production'])(
    'reads the text vars of %s from the real cloudflare.config.ts, not its secrets',
    async (environment) => {
      const declared = await readDeclaredVarNames(environment);
      for (const name of [
        'NODE_ENV',
        'WORKER_ENV',
        'APP_URL',
        'RESEND_FROM',
        'LOG_LEVEL',
      ]) {
        expect(declared.has(name)).toBe(true);
      }
      for (const name of [
        'JOBS_SIGNING_SECRET',
        'PARALLEL_API_KEY',
        'HYPERDRIVE',
      ]) {
        expect(declared.has(name)).toBe(false);
      }
    },
  );
});

describe('parseSecretNames', () => {
  it('reads names from the JSON array cf prints', () => {
    expect(
      parseSecretNames(
        '[\n  { "name": "JOBS_SIGNING_SECRET", "type": "secret_text" },\n  { "name": "JOBS_PAUSED", "type": "secret_text" }\n]',
      ),
    ).toEqual(new Set(['JOBS_SIGNING_SECRET', 'JOBS_PAUSED']));
    expect(parseSecretNames('[]').size).toBe(0);
  });

  it.each([
    ['non-JSON output', 'Error: not authenticated'],
    ['an unwrapped envelope', '{"success":true,"result":[]}'],
    ['entries without a name', '[{"type":"secret_text"}]'],
    ['null entries', '[null]'],
  ])('refuses %s', (_label, stdout) => {
    expect(() => parseSecretNames(stdout)).toThrow(SecretsSyncUsageError);
  });
});

describe('cloudflareSecretsPatch', () => {
  it('nests each value under secrets as an API secret object', () => {
    expect(cloudflareSecretsPatch({ OPENROUTER_API_KEY: 'sk-1' })).toEqual({
      secrets: {
        OPENROUTER_API_KEY: {
          name: 'OPENROUTER_API_KEY',
          type: 'secret_text',
          text: 'sk-1',
        },
      },
    });
  });
});

describe('planSync', () => {
  it('adds new names and updates existing ones for a Worker', () => {
    const plan = planSync({
      provider: 'cloudflare',
      names: ['OPENROUTER_API_KEY', 'JOBS_SIGNING_SECRET'],
      existing: new Set(['JOBS_SIGNING_SECRET']),
      declaredVars: new Set(),
    });
    expect(plan).toEqual([
      { name: 'JOBS_SIGNING_SECRET', action: 'update' },
      { name: 'OPENROUTER_API_KEY', action: 'add' },
    ]);
  });

  it('skips the nine retired job switches instead of pushing them back', () => {
    const retired = [
      'JOBS_PAUSED',
      'PARALLEL_DIRECT_RESEARCH',
      'JOB_PLAN_CLEANUP_ENABLED',
      'JOB_RETENTION_CLEANUP_ENABLED',
      'JOB_EMAIL_DELIVERY_ENABLED',
      'JOB_REGENERATION_ENABLED',
      'JOB_MODULE_LESSONS_ENABLED',
      'JOB_PLAN_GENERATION_ENABLED',
      'JOB_POSTHOG_DELETION_ENABLED',
    ];
    const plan = planSync({
      provider: 'cloudflare',
      names: [...retired, 'PARALLEL_API_KEY'],
      existing: new Set(['JOBS_PAUSED']),
    });
    for (const name of retired) {
      expect(plan.find((entry) => entry.name === name)).toEqual({
        name,
        action: 'skip',
        reason: 'retired switch (DEV-193), delete from 1Password',
      });
    }
    expect(
      plan.find((entry) => entry.name === 'PARALLEL_API_KEY')?.action,
    ).toBe('add');
  });

  it('never writes build secrets or declared vars to a Worker', () => {
    const plan = planSync({
      provider: 'cloudflare',
      names: ['SENTRY_AUTH_TOKEN', 'RESEND_FROM'],
      existing: new Set(),
      declaredVars: new Set(['RESEND_FROM']),
    });
    expect(plan.map((entry) => entry.action)).toEqual(['skip', 'skip']);
    expect(plan.find((entry) => entry.name === 'RESEND_FROM')?.reason).toBe(
      'declared in cloudflare.config.ts',
    );
  });

  it('never writes integration-managed or reserved names', () => {
    const plan = planSync({
      provider: 'vercel',
      names: [
        'POSTGRES_URL',
        'SUPABASE_SECRET_KEY',
        'NEXT_PUBLIC_SUPABASE_URL',
        'VERCEL_BYPASS_PROTECTION_TOKEN',
        'CUSTOM_OWNED',
        'FLAGSHIP_API_TOKEN',
      ],
      existing: new Set(),
      integrationOwned: new Set(['CUSTOM_OWNED']),
    });
    expect(
      plan
        .filter((entry) => entry.action !== 'skip')
        .map((entry) => entry.name),
    ).toEqual(['FLAGSHIP_API_TOKEN']);
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

describe.sequential('Cloudflare secrets through cf', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(spawn).mockReset();
  });

  it('lists the secrets of the Worker for the environment', async () => {
    vi.mocked(spawn).mockImplementation((() =>
      fakeChild(
        0,
        '[{"name":"JOBS_SIGNING_SECRET","type":"secret_text"}]',
      )) as unknown as typeof spawn);

    await expect(cloudflareSecretNames('staging')).resolves.toEqual(
      new Set(['JOBS_SIGNING_SECRET']),
    );

    const [command, args, options] = vi.mocked(spawn).mock.calls.at(-1)!;
    expect(command).toMatch(/workers\/jobs\/node_modules\/\.bin\/cf$/);
    expect(args).toEqual([
      'workers',
      'secrets',
      'list',
      '--worker',
      'atlaris-jobs-staging',
    ]);
    expect(options).toMatchObject({ cwd: 'workers/jobs' });
  });

  it('reports a failed listing with cf stderr', async () => {
    vi.mocked(spawn).mockImplementation((() =>
      fakeChild(1, '', 'Worker not found')) as unknown as typeof spawn);

    await expect(cloudflareSecretNames('production')).rejects.toThrow(
      /cf workers secrets list failed:\nWorker not found/,
    );
  });

  it('writes the secrets through a private temp file that is removed afterwards', async () => {
    const seen: {
      args: string[];
      body: unknown;
      mode: number;
      file: string;
    }[] = [];
    vi.mocked(spawn).mockImplementation(((_command: string, args: string[]) => {
      const file = args[args.indexOf('--file') + 1]!;
      seen.push({
        args,
        body: JSON.parse(readFileSync(file, 'utf8')),
        mode: statSync(file).mode & 0o777,
        file,
      });
      return fakeChild(0);
    }) as unknown as typeof spawn);

    const code = await applyCloudflare(SYNC_TARGETS['cloudflare production']!, {
      OPENROUTER_API_KEY: 'sk-never-on-the-command-line',
    });

    expect(code).toBe(0);
    expect(seen).toHaveLength(1);
    const [call] = seen;
    expect(call!.args.slice(0, 5)).toEqual([
      'workers',
      'secrets',
      'bulk',
      '--worker',
      'atlaris-jobs-production',
    ]);
    expect(call!.args.join(' ')).not.toContain('sk-never-on-the-command-line');
    expect(call!.body).toEqual({
      secrets: {
        OPENROUTER_API_KEY: {
          name: 'OPENROUTER_API_KEY',
          type: 'secret_text',
          text: 'sk-never-on-the-command-line',
        },
      },
    });
    expect(call!.mode).toBe(0o600);
    expect(existsSync(dirname(call!.file))).toBe(false);
  });

  it('returns the cf exit code and still removes the temp file', async () => {
    let file = '';
    vi.mocked(spawn).mockImplementation(((_command: string, args: string[]) => {
      file = args[args.indexOf('--file') + 1]!;
      return fakeChild(3, '', 'API error');
    }) as unknown as typeof spawn);
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const code = await applyCloudflare(SYNC_TARGETS['cloudflare staging']!, {
      RESEND_API_KEY: 're_secret',
    });

    expect(code).toBe(3);
    expect(error).toHaveBeenCalledWith(
      '[secrets] cf workers secrets bulk failed:\nAPI error',
    );
    expect(existsSync(dirname(file))).toBe(false);
  });
});

describe.sequential('readEnvironment', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(spawn).mockReset();
  });

  /** `op run` prints the child's env; the Environment adds RESEND_API_KEY. */
  function mockOpRun() {
    vi.mocked(spawn).mockImplementation(((_command: string, args: string[]) =>
      fakeChild(
        0,
        JSON.stringify(
          args.includes('--environment')
            ? { HOME: '/h', RESEND_API_KEY: 're_test' }
            : { HOME: '/h' },
        ),
      )) as unknown as typeof spawn);
  }

  it('runs the OP_EXECUTABLE wrapper for both op run calls', async () => {
    vi.stubEnv('OP_EXECUTABLE', '/opt/wrappers/op-sa');
    mockOpRun();

    await expect(
      readEnvironment(SYNC_TARGETS['cloudflare staging']!),
    ).resolves.toEqual({ RESEND_API_KEY: 're_test' });

    const calls = vi.mocked(spawn).mock.calls;
    expect(calls.map(([command]) => command)).toEqual([
      '/opt/wrappers/op-sa',
      '/opt/wrappers/op-sa',
    ]);
    expect(calls[0]![1]).toEqual(
      expect.arrayContaining(['--environment', 'uyosl4mrol6d5uqao4rtgh4qby']),
    );
  });

  it.each([undefined, ''])(
    'runs op from PATH when OP_EXECUTABLE is %j',
    async (value) => {
      vi.stubEnv('OP_EXECUTABLE', value);
      mockOpRun();

      await readEnvironment(SYNC_TARGETS['cloudflare staging']!);

      expect(vi.mocked(spawn).mock.calls.map(([command]) => command)).toEqual([
        'op',
        'op',
      ]);
    },
  );
});

describe.sequential('redeployVercel', () => {
  const deployments = JSON.stringify({
    deployments: [
      { url: 'building.vercel.app', state: 'BUILDING' },
      { url: 'ready.vercel.app', state: 'READY', createdAt: 0 },
    ],
  });

  // restoreAllMocks leaves the spawn call history alone, and the assertions
  // below index into it.
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(spawn).mockReset();
  });

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
