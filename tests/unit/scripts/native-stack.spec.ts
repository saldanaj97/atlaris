import {
  assertSafeDatabaseEnvironment,
  inspectAgentEnvFile,
  managedEnvFileContent,
  mergeManagedDatabaseUrls,
} from '../../../scripts/agents/agent-db-common';
import {
  type NativeStackStatus,
  type NativeStatusReport,
  assertNativePostgresUser,
  assertNativeStackDatabaseUrl,
  assertOwnedNativeStack,
  describeStartFailure,
  nativeStatusPassed,
  parsePasswd,
  parseStackStatus,
  unsupportedPlatformReason,
} from '../../../scripts/agents/native-stack';
import { describe, expect, it } from 'vitest';

const STACK_URL = 'postgresql://postgres:postgres@127.0.0.1:28711/postgres';
const REPO_ROOT = '/work/atlaris';

const statusJson = {
  identity: {
    id: 'bf7119a3',
    name: 'default',
    project_root: REPO_ROOT,
    branch_context: 'refs/heads/feature/example',
  },
  runtime: 'native',
  owner: 'reachable',
  lifecycle: 'running',
  readiness: 'ready',
  endpoints: {
    'database.sql': {
      protocol: 'tcp',
      address: '127.0.0.1',
      port: 28711,
      url: 'tcp://127.0.0.1:28711',
    },
  },
  env: { DB_URL: STACK_URL },
  message: '',
};

const passingReport: NativeStatusReport = {
  appliedMigrationCount: 63,
  committedMigrationCount: 63,
  cronBackgroundWorkers: 'on',
  missingMigrationCount: 0,
  seedPresent: true,
  unexpectedMigrationCount: 0,
};

describe('native stack database target', () => {
  it.each([
    STACK_URL,
    'postgres://postgres:postgres@localhost:28711/postgres',
    `${STACK_URL}?sslmode=disable`,
  ])('accepts and normalizes the local stack URL: %s', (url) => {
    expect(assertNativeStackDatabaseUrl(url)).toBe(STACK_URL);
  });

  it.each([
    'postgresql://postgres:secret@db.example.supabase.co:5432/postgres',
    'postgresql://postgres:postgres@database.example.com:28711/postgres',
    STACK_URL.replace('127.0.0.1', '192.0.2.10'),
    'postgresql://postgres:postgres@127.0.0.1/postgres',
    'postgresql://postgres:postgres@127.0.0.1:28711/atlaris-prod',
    'postgresql://supabase_admin:postgres@127.0.0.1:28711/postgres',
    'postgresql://postgres:secret@127.0.0.1:28711/postgres',
    `${STACK_URL}?sslmode=require`,
    `${STACK_URL}?host=db.example.supabase.co`,
    'mysql://postgres:postgres@127.0.0.1:28711/postgres',
    'not-a-url',
  ])('rejects an unmanaged target before connection: %s', (url) => {
    expect(() => assertNativeStackDatabaseUrl(url)).toThrow(/Refusing/);
  });

  it('rejects hosted database environment variables', () => {
    expect(() =>
      assertSafeDatabaseEnvironment(
        {
          POSTGRES_URL:
            'postgresql://postgres:secret@db.example.supabase.co:5432/postgres',
        },
        assertNativeStackDatabaseUrl,
      ),
    ).toThrow(/Refusing/);
    expect(() =>
      assertSafeDatabaseEnvironment(
        { DATABASE_URL: STACK_URL },
        assertNativeStackDatabaseUrl,
      ),
    ).toThrow(/Refusing to run while DATABASE_URL is set/);
    expect(() =>
      assertSafeDatabaseEnvironment(
        { SUPABASE_ACCESS_TOKEN: 'present' },
        assertNativeStackDatabaseUrl,
      ),
    ).toThrow(/hosted credential SUPABASE_ACCESS_TOKEN/);
  });

  it('keeps a current .env.local and rewrites a stale dynamic port', () => {
    const inspect = (content: string | null) =>
      inspectAgentEnvFile(content, assertNativeStackDatabaseUrl, STACK_URL);
    const stale = managedEnvFileContent(
      'postgresql://postgres:postgres@127.0.0.1:24444/postgres',
    );

    expect(inspect(null)).toBe('create');
    expect(inspect(managedEnvFileContent(STACK_URL))).toBe('keep');
    expect(inspect(stale)).toBe('merge');
    expect(inspect('NEXT_PUBLIC_APP_URL=http://localhost')).toBe('merge');
    expect(mergeManagedDatabaseUrls(stale, STACK_URL)).toBe(
      managedEnvFileContent(STACK_URL),
    );
  });

  it('fails closed on hosted or foreign database URLs in .env.local', () => {
    const inspect = (content: string) =>
      inspectAgentEnvFile(content, assertNativeStackDatabaseUrl, STACK_URL);

    expect(() =>
      inspect(
        'POSTGRES_URL=postgresql://postgres:x@db.example.supabase.co:5432/postgres\n',
      ),
    ).toThrow(/hosted database/);
    expect(() =>
      inspect(
        managedEnvFileContent(
          'postgresql://atlaris_agent@127.0.0.1:55432/atlaris_agent?sslmode=disable',
        ),
      ),
    ).toThrow(/Refusing a database other than postgres/);
    expect(() =>
      inspect(`POSTGRES_URL=${STACK_URL}\nPOSTGRES_URL=${STACK_URL}\n`),
    ).toThrow(/assigned more than once/);
  });
});

describe('native stack host requirements', () => {
  const passwd = parsePasswd(
    [
      'root:x:0:0:root:/root:/bin/bash',
      'nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin',
      'ubuntu:x:1000:1000::/home/ubuntu:/bin/bash',
      'wheelie:x:1001:0::/home/wheelie:/bin/bash',
    ].join('\n'),
  );

  it('parses passwd entries', () => {
    expect(passwd).toContainEqual({ name: 'ubuntu', uid: 1000, gid: 1000 });
  });

  it('allows non-root users without extra configuration', () => {
    expect(() => assertNativePostgresUser(1000, {}, [])).not.toThrow();
    expect(() => assertNativePostgresUser(undefined, {}, [])).not.toThrow();
  });

  it('requires SUPABASE_NATIVE_POSTGRES_USER when running as root', () => {
    expect(() => assertNativePostgresUser(0, {}, passwd)).toThrow(
      'Running as root: the native Supabase runtime will not run PostgreSQL as root. Set SUPABASE_NATIVE_POSTGRES_USER to an existing non-root OS user, or run this command as a non-root user.',
    );
    expect(() =>
      assertNativePostgresUser(
        0,
        { SUPABASE_NATIVE_POSTGRES_USER: 'ubuntu' },
        passwd,
      ),
    ).not.toThrow();
  });

  it.each(['missing', 'root', 'nobody', 'wheelie'])(
    'rejects an unusable step-down user: %s',
    (name) => {
      expect(() =>
        assertNativePostgresUser(
          0,
          { SUPABASE_NATIVE_POSTGRES_USER: name },
          passwd,
        ),
      ).toThrow(/SUPABASE_NATIVE_POSTGRES_USER=/);
    },
  );

  it.each([
    { platform: 'darwin', arch: 'arm64', macosVersion: '14.0' },
    { platform: 'darwin', arch: 'arm64', macosVersion: '27.0.1' },
    {
      platform: 'linux',
      arch: 'x64',
      lddVersionOutput:
        'ldd (Ubuntu GLIBC 2.39-0ubuntu8.4) 2.39\nCopyright (C) 2024 Free Software Foundation, Inc.',
    },
    {
      platform: 'linux',
      arch: 'arm64',
      lddVersionOutput: 'ldd (GNU libc) 2.35',
    },
  ] as const)('supports $platform $arch', (facts) => {
    expect(unsupportedPlatformReason(facts)).toBeNull();
  });

  it.each([
    [{ platform: 'darwin', arch: 'x64', macosVersion: '15.0' }, /arm64 only/],
    [
      { platform: 'darwin', arch: 'arm64', macosVersion: '13.6.1' },
      /macOS 14 or later \(found 13\.6\.1\)/,
    ],
    [
      {
        platform: 'linux',
        arch: 'x64',
        lddVersionOutput: 'ldd (Ubuntu GLIBC 2.31-0ubuntu9.16) 2.31',
      },
      /glibc 2\.35 or later \(found 2\.31\)/,
    ],
    [
      {
        platform: 'linux',
        arch: 'x64',
        lddVersionOutput: 'musl libc (x86_64)\nVersion 1.2.4',
      },
      /did not report glibc/,
    ],
    [{ platform: 'win32', arch: 'x64' }, /does not support win32/],
  ] as const)('rejects an unsupported host %#', (facts, reason) => {
    expect(unsupportedPlatformReason(facts)).toMatch(reason);
  });

  it('adds artifact download context to start failures that need it', () => {
    expect(
      describeStartFailure('getaddrinfo ENOTFOUND github.com', true),
    ).toMatch(/~483 MB .*supabase\/slim-services/);
    expect(describeStartFailure('stack failed', false)).toMatch(
      /~483 MB .*supabase\/slim-services/,
    );
    expect(describeStartFailure('port is in use', true)).toBe(
      'supabase start --runtime native failed: port is in use',
    );
  });
});

describe('native stack status', () => {
  it('reads runtime, readiness, port, and DB_URL from supabase status JSON', () => {
    expect(parseStackStatus(statusJson)).toEqual({
      dbUrl: STACK_URL,
      lifecycle: 'running',
      name: 'default',
      port: 28711,
      projectRoot: REPO_ROOT,
      readiness: 'ready',
      runtime: 'native',
    });
    expect(
      parseStackStatus({
        ...statusJson,
        lifecycle: null,
        readiness: 'unavailable',
        endpoints: {},
        env: {},
      }),
    ).toMatchObject({ dbUrl: null, port: null, readiness: 'unavailable' });
    expect(() => parseStackStatus({ message: '' })).toThrow(/unexpected shape/);
  });

  it("only operates on this checkout's default native stack", () => {
    const stack = parseStackStatus(statusJson);

    expect(() => assertOwnedNativeStack(stack, REPO_ROOT)).not.toThrow();
    expect(() => assertOwnedNativeStack(stack, '/work/other')).toThrow(
      /different checkout/,
    );
    expect(() =>
      assertOwnedNativeStack({ ...stack, name: 'test' }, REPO_ROOT),
    ).toThrow(/default stack/);
    expect(() =>
      assertOwnedNativeStack({ ...stack, runtime: 'docker' }, REPO_ROOT),
    ).toThrow(/uses the docker runtime/);
  });

  it('passes only a ready native stack with every migration, the seed, and pg_cron workers', () => {
    const stack: NativeStackStatus = parseStackStatus(statusJson);

    expect(nativeStatusPassed(stack, passingReport)).toBe(true);
    expect(
      nativeStatusPassed({ ...stack, readiness: 'starting' }, passingReport),
    ).toBe(false);
    expect(
      nativeStatusPassed(stack, { ...passingReport, missingMigrationCount: 1 }),
    ).toBe(false);
    expect(
      nativeStatusPassed(stack, {
        ...passingReport,
        unexpectedMigrationCount: 1,
      }),
    ).toBe(false);
    expect(
      nativeStatusPassed(stack, { ...passingReport, seedPresent: false }),
    ).toBe(false);
    expect(
      nativeStatusPassed(stack, {
        ...passingReport,
        cronBackgroundWorkers: 'off',
      }),
    ).toBe(false);
  });
});
