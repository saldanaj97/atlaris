import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const DEV_SCRIPT_ROOT = join(REPO_ROOT, 'scripts', 'dev');

type Fixture = {
  root: string;
  tools: string;
  toolsWithoutPortless: string;
  opPath: string;
  opLog: string;
  nextLog: string;
  portlessLog: string;
  tsxLog: string;
};

type CommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

const fixtures: Fixture[] = [];

function writeExecutable(path: string, contents: string): void {
  writeFileSync(path, `${contents.trimEnd()}\n`, { mode: 0o755 });
}

function createFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'atlaris-dev-launcher-'));
  const tools = mkdtempSync(join(tmpdir(), 'atlaris-dev-tools-'));
  const toolsWithoutPortless = mkdtempSync(
    join(tmpdir(), 'atlaris-dev-tools-no-portless-'),
  );
  const scriptsDir = join(root, 'scripts', 'dev');
  const binDir = join(root, 'node_modules', '.bin');
  const rootBinDir = join(root, 'bin');
  const opLog = join(root, 'op.log');
  const nextLog = join(root, 'next.log');
  const portlessLog = join(root, 'portless.log');
  const tsxLog = join(root, 'tsx.log');

  mkdirSync(scriptsDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  mkdirSync(rootBinDir, { recursive: true });
  for (const name of ['config.sh', 'start.sh', 'doctor.sh']) {
    copyFileSync(join(DEV_SCRIPT_ROOT, name), join(scriptsDir, name));
  }
  writeFileSync(join(root, 'portless.json'), '{"name":"atlaris"}\n');

  writeExecutable(
    join(binDir, 'next'),
    [
      '#!/usr/bin/env bash',
      'set -eu',
      'printf \'args=%s\\n\' "$*" >> "$FAKE_NEXT_LOG"',
      'printf \'portless_url=%s\\n\' "${PORTLESS_URL-}" >> "$FAKE_NEXT_LOG"',
      'printf \'node_options=%s\\n\' "${NODE_OPTIONS-}" >> "$FAKE_NEXT_LOG"',
      'printf \'service_token=%s\\n\' "${OP_SERVICE_ACCOUNT_TOKEN-}" >> "$FAKE_NEXT_LOG"',
      'printf \'connect_host=%s\\n\' "${OP_CONNECT_HOST-}" >> "$FAKE_NEXT_LOG"',
      'printf \'connect_token=%s\\n\' "${OP_CONNECT_TOKEN-}" >> "$FAKE_NEXT_LOG"',
    ].join('\n'),
  );
  writeExecutable(
    join(binDir, 'tsx'),
    [
      '#!/usr/bin/env bash',
      'set -eu',
      'printf \'args=%s\\n\' "$*" >> "$FAKE_TSX_LOG"',
      'printf \'service_token=%s\\n\' "${OP_SERVICE_ACCOUNT_TOKEN-}" >> "$FAKE_TSX_LOG"',
      'printf \'connect_host=%s\\n\' "${OP_CONNECT_HOST-}" >> "$FAKE_TSX_LOG"',
      'printf \'connect_token=%s\\n\' "${OP_CONNECT_TOKEN-}" >> "$FAKE_TSX_LOG"',
    ].join('\n'),
  );
  writeExecutable(
    join(binDir, 'supabase'),
    [
      '#!/usr/bin/env bash',
      'set -eu',
      'if [[ "${1-}" == status ]]; then exit "${FAKE_SUPABASE_STATUS:-1}"; fi',
    ].join('\n'),
  );

  writeExecutable(
    join(tools, 'pnpm'),
    [
      '#!/usr/bin/env bash',
      'if [[ "${1-}" == --version ]]; then printf \'11.9.0\\n\'; exit 0; fi',
      'exit 0',
    ].join('\n'),
  );
  writeExecutable(
    join(tools, 'docker'),
    ['#!/usr/bin/env bash', 'exit 0'].join('\n'),
  );
  writeExecutable(
    join(tools, 'portless'),
    [
      '#!/usr/bin/env bash',
      'set -eu',
      'case "${1-}" in',
      '  --version)',
      "    printf 'portless 0.9.0\\n'",
      '    ;;',
      '  doctor)',
      '    printf \'mode=doctor\\n\' >> "$FAKE_PORTLESS_LOG"',
      "    printf 'fake portless doctor\\n'",
      '    exit "${FAKE_PORTLESS_DOCTOR_STATUS:-0}"',
      '    ;;',
      '  run)',
      '    printf \'mode=run\\n\' >> "$FAKE_PORTLESS_LOG"',
      '    shift',
      '    for arg in "$@"; do printf \'arg=%s\\n\' "$arg" >> "$FAKE_PORTLESS_LOG"; done',
      '    export PORTLESS_URL="${FAKE_PORTLESS_URL:-https://fake.atlaris.localhost}"',
      '    exec "$@"',
      '    ;;',
      '  *)',
      '    exit 41',
      '    ;;',
      'esac',
    ].join('\n'),
  );
  writeExecutable(
    join(tools, 'op'),
    [
      '#!/usr/bin/env bash',
      'set -eu',
      'printf \'mode=%s\\n\' "${1-}" >> "$FAKE_OP_LOG"',
      'printf \'token_at_op=%s\\n\' "${OP_SERVICE_ACCOUNT_TOKEN-}" >> "$FAKE_OP_LOG"',
      'printf \'connect_host_at_op=%s\\n\' "${OP_CONNECT_HOST-}" >> "$FAKE_OP_LOG"',
      'printf \'connect_token_at_op=%s\\n\' "${OP_CONNECT_TOKEN-}" >> "$FAKE_OP_LOG"',
      'if [[ "${1-}" == whoami ]]; then',
      '  [[ "${FAKE_OP_AUTH:-ok}" == ok ]]',
      '  exit',
      'fi',
      '[[ "${1-}" == run ]] || exit 42',
      'shift',
      'while [[ $# -gt 0 && "$1" != -- ]]; do shift; done',
      '[[ $# -gt 0 ]] || exit 43',
      'shift',
      'if [[ "${FAKE_OP_ENV_ACCESS:-ok}" != ok ]]; then exit 44; fi',
      'if [[ "${FAKE_OP_INJECT_TOKEN:-1}" == 1 ]]; then export OP_SERVICE_ACCOUNT_TOKEN=injected-service-token; fi',
      'if [[ "${FAKE_OP_INJECT_PORTLESS_ZERO:-0}" == 1 ]]; then export PORTLESS=0; fi',
      'export APP_URL=http://localhost:3000',
      'export OP_CONNECT_HOST=injected-connect-host',
      'export OP_CONNECT_TOKEN=injected-connect-token',
      'exec "$@"',
    ].join('\n'),
  );

  for (const name of ['node', 'pnpm', 'docker']) {
    const source = name === 'node' ? process.execPath : join(tools, name);
    symlinkSync(source, join(toolsWithoutPortless, name));
  }
  symlinkSync(process.execPath, join(tools, 'node'));

  execFileSync('git', ['init', '--quiet'], { cwd: root });

  const fixture = {
    root,
    tools,
    toolsWithoutPortless,
    opPath: join(tools, 'op'),
    opLog,
    nextLog,
    portlessLog,
    tsxLog,
  };
  fixtures.push(fixture);
  return fixture;
}

function pathFor(fixture: Fixture, includePortless = true): string {
  const toolDir = includePortless
    ? fixture.tools
    : fixture.toolsWithoutPortless;
  const pathEntries = [toolDir];
  pathEntries.push('/usr/bin', '/bin');
  return pathEntries.join(':');
}

function runLauncher(
  fixture: Fixture,
  args: string[],
  overrides: Record<string, string> = {},
  options: { includePortless?: boolean } = {},
): CommandResult {
  const env = { ...process.env };
  for (const key of [
    'OP_EXECUTABLE',
    'OP_ENVIRONMENT_ID',
    'OP_SERVICE_ACCOUNT_TOKEN',
    'OP_CONNECT_HOST',
    'OP_CONNECT_TOKEN',
    'PORTLESS',
    'PORTLESS_URL',
    'FAKE_OP_AUTH',
    'FAKE_OP_ENV_ACCESS',
    'FAKE_OP_INJECT_PORTLESS_ZERO',
    'FAKE_PORTLESS_DOCTOR_STATUS',
  ]) {
    delete env[key];
  }
  const home = join(fixture.root, 'home');
  Object.assign(env, {
    PATH: pathFor(fixture, options.includePortless ?? true),
    HOME: home,
    OP_ENVIRONMENT_ID: 'test-environment',
    FAKE_OP_LOG: fixture.opLog,
    FAKE_NEXT_LOG: fixture.nextLog,
    FAKE_PORTLESS_LOG: fixture.portlessLog,
    FAKE_TSX_LOG: fixture.tsxLog,
    ...overrides,
  });
  mkdirSync(home, { recursive: true });

  const result = spawnSync(
    'bash',
    [join(fixture.root, 'scripts', 'dev', 'start.sh'), ...args],
    {
      cwd: fixture.root,
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000,
    },
  );

  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function readLog(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function countLines(log: string, line: string): number {
  return log.split('\n').filter((entry) => entry === line).length;
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    rmSync(fixture.root, { recursive: true, force: true });
    rmSync(fixture.tools, { recursive: true, force: true });
    rmSync(fixture.toolsWithoutPortless, { recursive: true, force: true });
  }
});

describe('local development launcher', () => {
  it.each([
    [['--unknown'], 'Usage: pnpm dev [--ui | --db | doctor]'],
    [['--ui', 'extra'], 'Usage: pnpm dev [--ui | --db | doctor]'],
    [['doctor', '--ui'], 'Usage: pnpm dev [--ui | --db | doctor]'],
  ])('rejects unsupported arguments: %j', (args, usage) => {
    const fixture = createFixture();
    const result = runLauncher(fixture, args);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(usage);
    expect(readLog(fixture.opLog)).toBe('');
  });

  it.each([
    { args: [], bundler: '--webpack' },
    { args: ['--ui'], bundler: '--turbopack' },
  ])('runs Portless once in $bundler mode', ({ args, bundler }) => {
    const fixture = createFixture();
    const result = runLauncher(fixture, args);
    const portlessLog = readLog(fixture.portlessLog);
    const nextLog = readLog(fixture.nextLog);

    expect(result.status).toBe(0);
    expect(countLines(portlessLog, 'mode=run')).toBe(1);
    expect(nextLog).toContain(`args=dev ${bundler} --hostname localhost`);
    expect(
      nextLog.split('\n').filter((line) => line.startsWith('args=')).length,
    ).toBe(1);
  });

  it('preserves existing NODE_OPTIONS while preferring IPv4 for loopback rewrites', () => {
    const fixture = createFixture();
    const result = runLauncher(fixture, [], {
      NODE_OPTIONS: '--max-old-space-size=512',
    });
    const nextLog = readLog(fixture.nextLog);

    expect(result.status).toBe(0);
    expect(nextLog).toContain(
      'node_options=--max-old-space-size=512 --dns-result-order=ipv4first',
    );
  });

  it('starts the database once before the canonical Portless dev server', () => {
    const fixture = createFixture();
    const result = runLauncher(fixture, ['--db'], {
      OP_SERVICE_ACCOUNT_TOKEN: 'db-service-token',
      OP_CONNECT_HOST: 'db-connect-host',
      OP_CONNECT_TOKEN: 'db-connect-token',
    });

    expect(result.status).toBe(0);
    const tsxLog = readLog(fixture.tsxLog);
    expect(tsxLog).toContain(`args=${fixture.root}/scripts/db/cli.ts start`);
    expect(tsxLog).toContain('service_token=');
    expect(tsxLog).toContain('connect_host=');
    expect(tsxLog).toContain('connect_token=');
    expect(tsxLog).not.toContain('db-service-token');
    expect(tsxLog).not.toContain('db-connect-host');
    expect(tsxLog).not.toContain('db-connect-token');
    expect(countLines(readLog(fixture.portlessLog), 'mode=run')).toBe(1);
  });

  it('removes inherited and injected credentials from the app process', () => {
    const fixture = createFixture();
    const result = runLauncher(fixture, [], {
      OP_SERVICE_ACCOUNT_TOKEN: 'inherited-service-token',
      OP_CONNECT_HOST: 'inherited-connect-host',
      OP_CONNECT_TOKEN: 'inherited-connect-token',
    });
    const opLog = readLog(fixture.opLog);
    const nextLog = readLog(fixture.nextLog);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(0);
    expect(opLog).toContain('token_at_op=inherited-service-token');
    expect(opLog).toContain('connect_host_at_op=');
    expect(opLog).toContain('connect_token_at_op=');
    expect(nextLog).toContain('service_token=');
    expect(nextLog).toContain('connect_host=');
    expect(nextLog).toContain('connect_token=');
    expect(output).not.toContain('inherited-service-token');
    expect(output).not.toContain('injected-service-token');
    expect(output).not.toContain('inherited-connect-token');
    expect(output).not.toContain('injected-connect-token');
  });

  it('rejects PORTLESS=0 before starting the app', () => {
    const fixture = createFixture();
    const result = runLauncher(fixture, [], { PORTLESS: '0' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('PORTLESS=0 is unsupported');
    expect(readLog(fixture.portlessLog)).toBe('');
    expect(readLog(fixture.opLog)).toBe('');
  });

  it('rejects PORTLESS=0 injected by the Environment before invoking Portless', () => {
    const fixture = createFixture();
    const result = runLauncher(fixture, [], {
      FAKE_OP_INJECT_PORTLESS_ZERO: '1',
      OP_SERVICE_ACCOUNT_TOKEN: 'inherited-service-token',
    });
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain(
      'PORTLESS=0 in the injected environment is unsupported',
    );
    expect(readLog(fixture.portlessLog)).toBe('');
    expect(output).not.toContain('inherited-service-token');
    expect(output).not.toContain('injected-service-token');
  });

  it.each(['node_modules/.bin/op', 'bin/op-link'])(
    'rejects project-controlled OP_EXECUTABLE paths: %s',
    (relativePath) => {
      const fixture = createFixture();
      const candidate = join(fixture.root, relativePath);
      mkdirSync(dirname(candidate), { recursive: true });
      if (relativePath.endsWith('op-link')) {
        symlinkSync(fixture.opPath, candidate);
      } else {
        writeExecutable(candidate, '#!/usr/bin/env bash\nexit 0');
      }

      const result = runLauncher(fixture, [], { OP_EXECUTABLE: candidate });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        'OP_EXECUTABLE must be an executable absolute path outside the repository and node_modules.',
      );
      expect(readLog(fixture.opLog)).toBe('');
    },
  );
});

describe('development doctor', () => {
  it('propagates 1Password authentication failure without exposing credentials', () => {
    const fixture = createFixture();
    const result = runLauncher(fixture, ['doctor'], {
      FAKE_OP_AUTH: 'fail',
      OP_SERVICE_ACCOUNT_TOKEN: 'auth-secret',
      OP_CONNECT_HOST: 'connect-host-secret',
      OP_CONNECT_TOKEN: 'connect-token-secret',
    });
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain('1Password authentication failed');
    expect(output).not.toContain('auth-secret');
    expect(output).not.toContain('connect-host-secret');
    expect(output).not.toContain('connect-token-secret');
  });

  it('propagates 1Password Environment access failure without exposing credentials', () => {
    const fixture = createFixture();
    const result = runLauncher(fixture, ['doctor'], {
      FAKE_OP_ENV_ACCESS: 'fail',
      OP_SERVICE_ACCOUNT_TOKEN: 'environment-secret',
    });
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain('1Password Environment access failed');
    expect(output).not.toContain('environment-secret');
  });

  it('preserves a failing Portless doctor status and remediation', () => {
    const fixture = createFixture();
    const result = runLauncher(fixture, ['doctor'], {
      FAKE_PORTLESS_DOCTOR_STATUS: '17',
      OP_SERVICE_ACCOUNT_TOKEN: 'portless-secret',
    });
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(17);
    expect(output).toContain('Portless doctor exited 17');
    expect(output).toContain('portless trust');
    expect(readLog(fixture.portlessLog)).toContain('mode=doctor');
    expect(output).not.toContain('portless-secret');
  });

  it('fails clearly when Portless is unavailable', () => {
    const fixture = createFixture();
    const result = runLauncher(
      fixture,
      ['doctor'],
      { OP_EXECUTABLE: fixture.opPath },
      { includePortless: false },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Portless is required');
  });
});
