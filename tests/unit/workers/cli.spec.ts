import {
  findForbiddenBundleModules,
  readLocalDatabaseUrl,
  workerDevPorts,
  WorkersCliUsageError,
} from '../../../scripts/workers/cli';
import { describe, expect, it } from 'vitest';

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
