import {
  bundleDryRunArgs,
  findForbiddenBundleModules,
  readLocalDatabaseUrl,
  runWorkersCli,
  startupCpuMs,
  startupProfileArgs,
  STARTUP_CPU_BUDGET_MS,
  workerDevCommand,
  workerDevPorts,
  WorkersCliUsageError,
} from '../../../scripts/workers/cli';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Replaces the whole module, named and default exports alike, so no test can
// start a real `cf` or `wrangler` process.
vi.mock('node:child_process', () => {
  const spawn = vi.fn();
  return { spawn, default: { spawn } };
});

const spawnMock = vi.mocked(spawn);

afterEach(() => {
  spawnMock.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('findForbiddenBundleModules', () => {
  it('passes a bundle without Next, Vercel, Clerk, or workflow modules', () => {
    expect(
      findForbiddenBundleModules({
        inputs: {
          'src/index.ts': {},
          '../../node_modules/.pnpm/pg@8.23.0/node_modules/pg/lib/index.js': {},
          '../../src/lib/next-steps.ts': {},
        },
        outputs: {
          'index.js': {
            imports: [{ path: 'node:async_hooks', external: true }],
          },
        },
      }),
    ).toEqual([]);
  });

  it('reports bundled inputs and external imports that must not ship', () => {
    const forbidden = findForbiddenBundleModules({
      inputs: {
        '../../node_modules/.pnpm/next@16.3.6/node_modules/next/dist/cache.js':
          {},
        '../../node_modules/.pnpm/@vercel+oidc@1.0.0/node_modules/@vercel/oidc/index.js':
          {},
        '../../node_modules/.pnpm/@clerk+nextjs@7.8.3/node_modules/@clerk/nextjs/server.js':
          {},
        '../../node_modules/.pnpm/workflow@4.8.9/node_modules/workflow/api.js':
          {},
      },
      outputs: {
        'index.js': {
          imports: [
            { path: 'next/cache', external: true },
            { path: '@workflow/core', external: true },
            { path: 'nextgen', external: true },
          ],
        },
      },
    });

    expect(forbidden).toHaveLength(6);
    expect(forbidden).toContain('external next/cache');
    expect(forbidden).toContain('external @workflow/core');
    expect(forbidden).not.toContain('external nextgen');
  });
});

describe('startupCpuMs', () => {
  it('counts every sample except idle, garbage collection included', () => {
    expect(
      startupCpuMs({
        nodes: [
          { id: 1, callFrame: { functionName: '(root)' } },
          { id: 2, callFrame: { functionName: '(idle)' } },
          { id: 3, callFrame: { functionName: '(garbage collector)' } },
          { id: 4, callFrame: { functionName: 'init_schemas' } },
        ],
        samples: [4, 2, 3, 4, 2],
        timeDeltas: [10_000, 30_000, 5_000, 2_500, 1_000],
      }),
    ).toBe(17.5);
  });
});

describe('readLocalDatabaseUrl', () => {
  it('returns a loopback POSTGRES_URL', () => {
    expect(
      readLocalDatabaseUrl(
        'OTHER=1\nPOSTGRES_URL="postgresql://postgres:postgres@127.0.0.1:24012/postgres"\n',
      ),
    ).toBe('postgresql://postgres:postgres@127.0.0.1:24012/postgres');
  });

  it('refuses a hosted database without echoing credentials', () => {
    const hosted = new URL('postgresql://db.abc.supabase.co:5432/postgres');
    hosted.username = 'postgres';
    hosted.password = 'fixture-password';

    let caught: unknown;
    try {
      readLocalDatabaseUrl(`POSTGRES_URL=${hosted.href}\n`);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(WorkersCliUsageError);
    expect((caught as Error).message).toBe(
      'Refusing to run the Worker against a non-local database (host: db.abc.supabase.co).',
    );
  });

  it('asks for a database when POSTGRES_URL is missing', () => {
    expect(() => readLocalDatabaseUrl('OTHER=1\n')).toThrow(/pnpm db start/);
  });
});

describe('workerDevPorts', () => {
  it('derives stable, distinct ports per worktree path', () => {
    const first = workerDevPorts('/worktrees/a');
    expect(workerDevPorts('/worktrees/a')).toEqual(first);
    expect(first.port).toBeGreaterThanOrEqual(18800);
    expect(first.port).toBeLessThan(19300);
    expect(first.inspector).toBe(first.port + 500);
  });
});

describe('workerDevCommand', () => {
  const databaseUrl = 'postgresql://postgres:postgres@127.0.0.1:24012/postgres';
  const baseEnv = { NODE_ENV: 'test' } as const;

  it('runs cf dev on the worktree port, with no flag cf dev rejects', () => {
    const { args } = workerDevCommand(
      { port: 18800, inspector: 19300 },
      databaseUrl,
      baseEnv,
    );

    expect(args).toEqual(['dev', '--port', '18800']);
  });

  it('points Hyperdrive at the local database and hands the inspector port to wrangler.config.ts', async () => {
    const { env } = workerDevCommand(
      { port: 18800, inspector: 19300 },
      databaseUrl,
      { ...baseEnv, PATH: '/usr/bin' },
    );
    expect(env).toMatchObject({
      PATH: '/usr/bin',
      CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: databaseUrl,
    });

    // The producer and consumer of the inspector port are in different files:
    // load the real config with exactly what the CLI adds to the environment.
    const added = workerDevCommand(
      { port: 1, inspector: 19300 },
      '',
      baseEnv,
    ).env;
    for (const [name, value] of Object.entries(added)) {
      vi.stubEnv(name, value);
    }
    vi.resetModules();
    const { default: config } =
      await import('../../../workers/jobs/wrangler.config');

    expect(config).toMatchObject({
      dev: { ip: '127.0.0.1', inspectorPort: 19300 },
    });
  });

  it('leaves the inspector port to wrangler when the CLI did not set one', async () => {
    vi.stubEnv('ATLARIS_JOBS_DEV_INSPECTOR_PORT', '');
    vi.resetModules();
    const { default: config } =
      await import('../../../workers/jobs/wrangler.config');

    expect(config).toMatchObject({ dev: { ip: '127.0.0.1' } });
    expect((config as { dev: object }).dev).not.toHaveProperty('inspectorPort');
  });
});

describe('bundleDryRunArgs', () => {
  it('bundles the staging Worker with the new config and writes a metafile', () => {
    expect(bundleDryRunArgs('/tmp/bundle', '/tmp/bundle/meta.json')).toEqual([
      'deploy',
      '--dry-run',
      '--experimental-new-config',
      '--env',
      'staging',
      '--outdir',
      '/tmp/bundle',
      '--metafile',
      '/tmp/bundle/meta.json',
    ]);
  });
});

describe('startupProfileArgs', () => {
  it('profiles the staging Worker into the given file', () => {
    expect(startupProfileArgs('/tmp/bundle/startup-1.cpuprofile')).toEqual([
      'workers',
      'check',
      '--mode',
      'staging',
      '--outfile',
      '/tmp/bundle/startup-1.cpuprofile',
    ]);
  });
});

describe('runWorkersCli', () => {
  const cleanMetafile = {
    inputs: { 'src/index.ts': {} },
    outputs: { 'index.js': { imports: [] } },
  };

  function cpuProfile(ms: number) {
    return {
      nodes: [{ id: 1, callFrame: { functionName: 'init_schemas' } }],
      samples: [1],
      timeDeltas: [ms * 1000],
    };
  }

  function argAfter(args: string[], flag: string): string {
    return args[args.indexOf(flag) + 1] ?? '';
  }

  /** Stands in for cf and wrangler: `behave` runs as the tool starts, then it exits. */
  function fakeTools(behave: (tool: string, args: string[]) => number): void {
    spawnMock.mockImplementation(((binary: string, args: string[]) => {
      const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
      const code = behave(basename(binary), args);
      setImmediate(() => child.emit('close', code));
      return child;
    }) as unknown as typeof spawn);
  }

  /** Fakes a bundle and one startup profile per entry in `startupMs`. */
  function fakeBuild(options: {
    metafile?: object;
    startupMs: number[];
  }): void {
    let profiles = 0;
    fakeTools((tool, args) => {
      if (tool === 'wrangler') {
        writeFileSync(
          argAfter(args, '--metafile'),
          JSON.stringify(options.metafile ?? cleanMetafile),
        );
      } else {
        writeFileSync(
          argAfter(args, '--outfile'),
          JSON.stringify(cpuProfile(options.startupMs[profiles++] ?? 0)),
        );
      }
      return 0;
    });
  }

  function startedTools() {
    return spawnMock.mock.calls.map(([binary, args, options]) => ({
      binary: String(binary),
      tool: basename(String(binary)),
      args: args as string[],
      cwd: (options as { cwd?: string }).cwd,
    }));
  }

  function silenceConsole() {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    return vi.spyOn(console, 'error').mockImplementation(() => {});
  }

  it('regenerates the types with cf from the Worker directory', async () => {
    fakeTools(() => 0);

    await expect(runWorkersCli(['types'])).resolves.toBe(0);

    expect(startedTools()).toEqual([
      {
        binary: expect.stringMatching(
          /workers\/jobs\/node_modules\/\.bin\/cf$/,
        ),
        tool: 'cf',
        args: ['workers', 'types'],
        cwd: 'workers/jobs',
      },
    ]);
  });

  it('passes the cf exit code through', async () => {
    fakeTools(() => 3);

    await expect(runWorkersCli(['types'])).resolves.toBe(3);
  });

  it('bundles with wrangler, then profiles startup three times with cf, and cleans up', async () => {
    silenceConsole();
    fakeBuild({ startupMs: [90, 80, 85] });

    await expect(runWorkersCli(['check'])).resolves.toBe(0);

    const [bundle, ...profiles] = startedTools();
    expect(bundle).toMatchObject({ tool: 'wrangler', cwd: 'workers/jobs' });
    expect(bundle?.binary).toMatch(
      /workers\/jobs\/node_modules\/\.bin\/wrangler$/,
    );
    expect(bundle?.args).toEqual(
      bundleDryRunArgs(
        argAfter(bundle?.args ?? [], '--outdir'),
        argAfter(bundle?.args ?? [], '--metafile'),
      ),
    );
    expect(profiles.map(({ tool, cwd }) => ({ tool, cwd }))).toEqual(
      Array.from({ length: 3 }, () => ({ tool: 'cf', cwd: 'workers/jobs' })),
    );
    expect(profiles.map(({ args }) => args.slice(0, 4))).toEqual(
      Array.from({ length: 3 }, () => [
        'workers',
        'check',
        '--mode',
        'staging',
      ]),
    );
    expect(
      existsSync(dirname(argAfter(bundle?.args ?? [], '--metafile'))),
    ).toBe(false);
  });

  it('passes when the best of the startup profiles is within budget', async () => {
    silenceConsole();
    fakeBuild({
      startupMs: [
        STARTUP_CPU_BUDGET_MS + 100,
        STARTUP_CPU_BUDGET_MS + 50,
        STARTUP_CPU_BUDGET_MS - 100,
      ],
    });

    await expect(runWorkersCli(['check'])).resolves.toBe(0);
  });

  it('fails when even the best startup profile is over budget', async () => {
    const errors = silenceConsole();
    fakeBuild({
      startupMs: [
        STARTUP_CPU_BUDGET_MS + 100,
        STARTUP_CPU_BUDGET_MS + 50,
        STARTUP_CPU_BUDGET_MS + 75,
      ],
    });

    await expect(runWorkersCli(['check'])).resolves.toBe(1);

    expect(errors).toHaveBeenCalledWith(
      expect.stringContaining('Startup gate failed: 250.0 ms startup CPU'),
    );
  });

  it('fails the bundle gate without profiling startup', async () => {
    const errors = silenceConsole();
    fakeBuild({
      metafile: {
        inputs: {
          '../../node_modules/.pnpm/next@16.3.6/node_modules/next/dist/cache.js':
            {},
        },
        outputs: {},
      },
      startupMs: [],
    });

    await expect(runWorkersCli(['check'])).resolves.toBe(1);

    expect(startedTools().map(({ tool }) => tool)).toEqual(['wrangler']);
    expect(errors).toHaveBeenCalledWith(
      expect.stringContaining('node_modules/next/dist/cache.js'),
    );
  });

  it('stops at the first failing tool and still cleans up', async () => {
    silenceConsole();
    let bundleDir = '';
    fakeTools((tool, args) => {
      if (tool === 'wrangler') {
        bundleDir = argAfter(args, '--outdir');
        writeFileSync(
          argAfter(args, '--metafile'),
          JSON.stringify(cleanMetafile),
        );
        return 0;
      }
      return 2;
    });

    await expect(runWorkersCli(['check'])).resolves.toBe(2);

    expect(startedTools().map(({ tool }) => tool)).toEqual(['wrangler', 'cf']);
    expect(bundleDir).not.toBe('');
    expect(existsSync(bundleDir)).toBe(false);
  });

  it.each([[[]], [['wat']], [['dev', 'check']]])(
    'rejects %j with the usage text and starts nothing',
    async (argv) => {
      const error = await runWorkersCli(argv).catch(
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(WorkersCliUsageError);
      expect((error as Error).message).toContain(
        'workers/jobs/.cloudflare/types/index.d.ts',
      );
      expect(spawnMock).not.toHaveBeenCalled();
    },
  );
});
