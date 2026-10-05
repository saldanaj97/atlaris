import {
  LOCAL_PRODUCT_TESTING_SEED_AUTH_USER_ID,
  LOCAL_PRODUCT_TESTING_SEED_EMAIL,
  LOCAL_PRODUCT_TESTING_SEED_NAME,
  LOCAL_PRODUCT_TESTING_SEED_USER_ROW_ID,
} from '../../src/lib/config/local-product-testing';
import {
  type AgentCommands,
  assertEnvironmentBoundary,
  fail,
  listCommittedMigrationVersions,
  log,
  pathExists,
  unexpectedMigrationVersions,
  writeAgentEnvFile,
} from './agent-db-common';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import postgres from 'postgres';

const NATIVE_USER_ENV = 'SUPABASE_NATIVE_POSTGRES_USER';
const ARTIFACT_CACHE = join(homedir(), '.supabase', 'cache', 'stack');
const DOWNLOAD_CONTEXT =
  'The first native start downloads ~483 MB of artifacts from GitHub supabase/slim-services releases into ~/.supabase/cache/stack; check outbound HTTPS access to github.com (pnpm db agent preflight checks it).';
const DOWNLOAD_FAILURE_PATTERN =
  /download|artifact|fetch|network|github|ENOTFOUND|ECONN|ETIMEDOUT|EAI_AGAIN|getaddrinfo|socket|TLS|certificate|HTTP/i;
// The local stack's well-known default: role, password, and database are all `postgres`.
const LOCAL_STACK_ROLE = 'postgres';
const CRON_ADMIN_ROLE = 'supabase_admin';
const MIN_MACOS_MAJOR = 14;
const MIN_GLIBC = [2, 35] as const;

export type NativeStackStatus = {
  dbUrl: string | null;
  lifecycle: string | null;
  name: string;
  port: number | null;
  projectRoot: string;
  readiness: string;
  runtime: string;
};

export type NativeStatusReport = {
  appliedMigrationCount: number;
  committedMigrationCount: number;
  cronBackgroundWorkers: string;
  missingMigrationCount: number;
  seedPresent: boolean;
  unexpectedMigrationCount: number;
};

type PlatformFacts = {
  arch: string;
  lddVersionOutput?: string;
  macosVersion?: string;
  platform: NodeJS.Platform;
};

type PasswdEntry = { gid: number; name: string; uid: number };

/**
 * Accepts only the native stack's local database URL shape: the local
 * `postgres` superuser password on a loopback host, database `postgres`.
 */
export function assertNativeStackDatabaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return fail('Refusing malformed database URL.');
  }

  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    return fail('Refusing a non-PostgreSQL database URL.');
  }
  if (host !== '127.0.0.1' && host !== 'localhost') {
    return fail('Refusing a database host outside the loopback interface.');
  }
  if (!/^\d+$/.test(url.port)) {
    return fail('Refusing a database URL without an explicit port.');
  }
  if (decodeURIComponent(url.pathname) !== `/${LOCAL_STACK_ROLE}`) {
    return fail('Refusing a database other than postgres.');
  }
  if (
    decodeURIComponent(url.username) !== LOCAL_STACK_ROLE ||
    decodeURIComponent(url.password) !== LOCAL_STACK_ROLE
  ) {
    return fail('Refusing credentials other than the local stack defaults.');
  }
  const params = [...url.searchParams.entries()];
  if (
    url.hash ||
    params.some(([key, value]) => key !== 'sslmode' || value !== 'disable')
  ) {
    return fail('Refusing unexpected URL options on the local stack target.');
  }

  return `postgresql://${LOCAL_STACK_ROLE}:${LOCAL_STACK_ROLE}@127.0.0.1:${url.port}/${LOCAL_STACK_ROLE}`;
}

export function parsePasswd(content: string): PasswdEntry[] {
  return content.split(/\r?\n/).flatMap((line) => {
    const [name = '', , uid = '', gid = ''] = line.split(':');
    return /^\d+$/.test(uid) && /^\d+$/.test(gid)
      ? [{ name, uid: Number(uid), gid: Number(gid) }]
      : [];
  });
}

/** The native runtime refuses to run PostgreSQL as root; require an explicit step-down user. */
export function assertNativePostgresUser(
  uid: number | undefined,
  environment: Partial<Record<string, string | undefined>>,
  passwd: PasswdEntry[],
): void {
  if (uid !== 0) return;
  const name = environment[NATIVE_USER_ENV]?.trim();
  if (!name) {
    fail(
      `Running as root: the native Supabase runtime will not run PostgreSQL as root. Set ${NATIVE_USER_ENV} to an existing non-root OS user, or run this command as a non-root user.`,
    );
  }
  const user = passwd.find((entry) => entry.name === name);
  if (!user) {
    fail(`${NATIVE_USER_ENV}=${name} does not name a user in /etc/passwd.`);
  }
  if (user.uid === 0 || user.gid === 0 || user.uid === 65534) {
    fail(
      `${NATIVE_USER_ENV}=${name} resolves to uid ${user.uid} and gid ${user.gid}, which cannot run PostgreSQL.`,
    );
  }
}

/** Returns why the host cannot run the native runtime, or null when it can. */
export function unsupportedPlatformReason(facts: PlatformFacts): string | null {
  if (facts.platform === 'darwin') {
    if (facts.arch !== 'arm64') {
      return `The native Supabase runtime supports macOS on arm64 only (found ${facts.arch}).`;
    }
    const major = Number(facts.macosVersion?.split('.')[0]);
    if (!Number.isInteger(major) || major < MIN_MACOS_MAJOR) {
      return `The native Supabase runtime needs macOS ${MIN_MACOS_MAJOR} or later (found ${facts.macosVersion || 'unknown'}).`;
    }
    return null;
  }
  if (facts.platform === 'linux') {
    const firstLine = facts.lddVersionOutput?.split(/\r?\n/, 1)[0] ?? '';
    const match = firstLine.match(/(\d+)\.(\d+)\s*$/);
    if (!/glibc|gnu libc/i.test(firstLine) || !match) {
      return `The native Supabase runtime needs glibc ${MIN_GLIBC.join('.')} or later; \`ldd --version\` did not report glibc.`;
    }
    const version = [Number(match[1]), Number(match[2])] as const;
    if (
      version[0] < MIN_GLIBC[0] ||
      (version[0] === MIN_GLIBC[0] && version[1] < MIN_GLIBC[1])
    ) {
      return `The native Supabase runtime needs glibc ${MIN_GLIBC.join('.')} or later (found ${version.join('.')}).`;
    }
    return null;
  }
  return `The native Supabase runtime does not support ${facts.platform}.`;
}

export function describeStartFailure(
  message: string,
  artifactCacheExisted: boolean,
): string {
  const failure = `supabase start --runtime native failed: ${message}`;
  return !artifactCacheExisted || DOWNLOAD_FAILURE_PATTERN.test(message)
    ? `${failure} ${DOWNLOAD_CONTEXT}`
    : failure;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

export function parseStackStatus(json: unknown): NativeStackStatus {
  const status = record(json);
  const identity = record(status.identity);
  const sql = record(record(status.endpoints)['database.sql']);
  const projectRoot = stringOrNull(identity.project_root);
  const name = stringOrNull(identity.name);
  const runtime = stringOrNull(status.runtime);
  if (!projectRoot || !name || !runtime) {
    return fail('supabase status returned an unexpected shape.');
  }
  return {
    dbUrl: stringOrNull(record(status.env).DB_URL),
    lifecycle: stringOrNull(status.lifecycle),
    name,
    port: typeof sql.port === 'number' ? sql.port : null,
    projectRoot,
    readiness: stringOrNull(status.readiness) ?? 'unknown',
    runtime,
  };
}

/** Proves the stack is this checkout's default native stack before anything reads or resets it. */
export function assertOwnedNativeStack(
  status: NativeStackStatus,
  repositoryRoot: string,
): void {
  if (resolve(status.projectRoot) !== resolve(repositoryRoot)) {
    fail('supabase status describes a stack for a different checkout.');
  }
  if (status.name !== 'default') {
    fail(`Expected the default stack, found "${status.name}".`);
  }
  if (status.runtime !== 'native') {
    fail(
      `This checkout's default stack uses the ${status.runtime} runtime. This command does not change it; destroy it yourself with \`pnpm exec supabase stack destroy --yes\` only if its data can be discarded.`,
    );
  }
}

export function nativeStatusPassed(
  stack: NativeStackStatus,
  report: NativeStatusReport,
): boolean {
  return (
    stack.runtime === 'native' &&
    stack.readiness === 'ready' &&
    report.missingMigrationCount === 0 &&
    report.unexpectedMigrationCount === 0 &&
    report.seedPresent &&
    report.cronBackgroundWorkers === 'on'
  );
}

type CliResult = { ok: true; json: unknown } | { ok: false; message: string };

function supabase(args: string[], options?: { progress?: boolean }): CliResult {
  const result = spawnSync(
    'pnpm',
    ['exec', 'supabase', ...args, '--output-format', 'json'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', options?.progress ? 'inherit' : 'pipe'],
    },
  );
  if (result.error) {
    return { ok: false, message: result.error.message };
  }
  let json: unknown;
  try {
    json = JSON.parse(result.stdout.trim());
  } catch {
    json = undefined;
  }
  if (result.status === 0 && json !== undefined) return { ok: true, json };

  const error = record(record(json).error);
  const detail = [error.code, error.message, error.suggestion]
    .filter((part) => typeof part === 'string' && part)
    .join(': ');
  const stderr = (result.stderr ?? '')
    .trim()
    .split(/\r?\n/)
    .slice(-5)
    .join(' ');
  return {
    ok: false,
    message: detail || stderr || `exited with status ${String(result.status)}`,
  };
}

function requireSupabase(
  args: string[],
  options?: { progress?: boolean },
): unknown {
  const result = supabase(args, options);
  if (!result.ok) fail(`supabase ${args.join(' ')} failed: ${result.message}`);
  return result.json;
}

/** Read-only: returns null when this checkout has no default stack yet. */
function readStackStatus(): NativeStackStatus | null {
  const result = supabase(['status']);
  if (!result.ok) {
    if (/No managed stack exists/i.test(result.message)) return null;
    return fail(`supabase status failed: ${result.message}`);
  }
  const status = parseStackStatus(result.json);
  assertOwnedNativeStack(status, process.cwd());
  return status;
}

function requireReadyStack(): NativeStackStatus & { dbUrl: string } {
  const status = readStackStatus();
  if (!status) return fail('The native stack did not start.');
  if (status.readiness !== 'ready' || !status.dbUrl) {
    return fail(
      `The native stack is not ready (readiness ${status.readiness}).`,
    );
  }
  return { ...status, dbUrl: assertNativeStackDatabaseUrl(status.dbUrl) };
}

function runQuiet(binary: string, args: string[]): string {
  const result = spawnSync(binary, args, { encoding: 'utf8' });
  return `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
}

async function assertNativeHost(): Promise<void> {
  const reason = unsupportedPlatformReason({
    platform: process.platform,
    arch: process.arch,
    macosVersion:
      process.platform === 'darwin'
        ? runQuiet('sw_vers', ['-productVersion'])
        : undefined,
    lddVersionOutput:
      process.platform === 'linux' ? runQuiet('ldd', ['--version']) : undefined,
  });
  if (reason) fail(reason);

  const uid = process.getuid?.();
  const passwd =
    uid === 0
      ? parsePasswd(await readFile('/etc/passwd', 'utf8').catch(() => ''))
      : [];
  assertNativePostgresUser(uid, process.env, passwd);
}

async function assertGithubReachable(): Promise<void> {
  try {
    await fetch('https://github.com/', {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    fail(
      `github.com is not reachable over HTTPS (${cause}). ${DOWNLOAD_CONTEXT}`,
    );
  }
}

async function startNativeStack(): Promise<void> {
  const artifactCacheExisted = await pathExists(ARTIFACT_CACHE);
  const result = supabase(['start', '--runtime', 'native'], { progress: true });
  if (!result.ok) {
    fail(describeStartFailure(result.message, artifactCacheExisted));
  }
}

function withRole(dbUrl: string, role: string): string {
  const url = new URL(dbUrl);
  url.username = role;
  return url.toString();
}

async function readCronBackgroundWorkers(dbUrl: string): Promise<string> {
  const sql = postgres(dbUrl, { max: 1, connect_timeout: 5 });
  try {
    const [row] = await sql<{ value: string | null }[]>`
      select current_setting('cron.use_background_workers', true) as value
    `;
    return row?.value ?? 'unavailable';
  } finally {
    await sql.end();
  }
}

/**
 * pg_cron cannot reach the socket-only native Postgres unless jobs run in
 * background workers (supabase/cli#6977). `db reset` reverts the setting, so
 * apply it after every start and reset.
 */
async function ensureCronBackgroundWorkers(
  stack: NativeStackStatus & { dbUrl: string },
): Promise<NativeStackStatus & { dbUrl: string }> {
  if ((await readCronBackgroundWorkers(stack.dbUrl)) === 'on') return stack;

  const sql = postgres(withRole(stack.dbUrl, CRON_ADMIN_ROLE), {
    max: 1,
    connect_timeout: 5,
  });
  try {
    await sql.unsafe('ALTER SYSTEM SET cron.use_background_workers = on');
  } finally {
    await sql.end();
  }
  requireSupabase(['stack', 'restart']);
  const restarted = requireReadyStack();
  if ((await readCronBackgroundWorkers(restarted.dbUrl)) !== 'on') {
    fail('cron.use_background_workers is still off after the stack restart.');
  }
  log('Enabled pg_cron background workers (supabase/cli#6977) and restarted.');
  return restarted;
}

function assertProcessEnvironmentMatches(dbUrl: string): void {
  for (const key of ['POSTGRES_URL', 'POSTGRES_URL_NON_POOLING']) {
    const value = process.env[key]?.trim();
    if (value && assertNativeStackDatabaseUrl(value) !== dbUrl) {
      fail(
        `${key} in the process environment does not match the native stack port and would override .env.local; unset it.`,
      );
    }
  }
}

async function collectNativeStatus(dbUrl: string): Promise<NativeStatusReport> {
  const expected = await listCommittedMigrationVersions();
  const sql = postgres(dbUrl, { max: 1, connect_timeout: 5 });
  try {
    const applied = await sql<{ version: string }[]>`
      select version::text
      from supabase_migrations.schema_migrations
      order by version
    `;
    const [seed] = await sql<{ present: boolean }[]>`
      select exists(
        select 1
        from users
        where id = ${LOCAL_PRODUCT_TESTING_SEED_USER_ROW_ID}::uuid
          and auth_user_id = ${LOCAL_PRODUCT_TESTING_SEED_AUTH_USER_ID}
          and email = ${LOCAL_PRODUCT_TESTING_SEED_EMAIL}
          and name = ${LOCAL_PRODUCT_TESTING_SEED_NAME}
      ) as present
    `;
    const appliedVersions = applied.map((row) => row.version);
    const appliedSet = new Set(appliedVersions);
    return {
      appliedMigrationCount: appliedSet.size,
      committedMigrationCount: expected.length,
      cronBackgroundWorkers: await readCronBackgroundWorkers(dbUrl),
      missingMigrationCount: expected.filter(
        (version) => !appliedSet.has(version),
      ).length,
      seedPresent: seed?.present === true,
      unexpectedMigrationCount: unexpectedMigrationVersions(
        expected,
        appliedVersions,
      ).length,
    };
  } finally {
    await sql.end();
  }
}

function printStackStatus(stack: NativeStackStatus): void {
  log(`runtime: ${stack.runtime}`);
  log(
    `readiness: ${stack.readiness}${stack.lifecycle ? ` (lifecycle ${stack.lifecycle})` : ''}`,
  );
  log(`port: ${stack.port ?? 'none'}`);
}

function printNativeStatus(
  stack: NativeStackStatus,
  report: NativeStatusReport,
): void {
  printStackStatus(stack);
  log(
    `applied migrations: ${report.appliedMigrationCount} of ${report.committedMigrationCount} committed (pending ${report.missingMigrationCount}, unexpected ${report.unexpectedMigrationCount})`,
  );
  log(`seed user: ${report.seedPresent ? 'present' : 'missing'}`);
  log(`pg_cron background workers: ${report.cronBackgroundWorkers}`);
  log(`overall: ${nativeStatusPassed(stack, report) ? 'PASS' : 'FAIL'}`);
}

async function finishProvisioning(
  stack: NativeStackStatus & { dbUrl: string },
  failure: string,
): Promise<void> {
  const ready = await ensureCronBackgroundWorkers(stack);
  assertProcessEnvironmentMatches(ready.dbUrl);
  const envAction = await assertEnvironmentBoundary(
    assertNativeStackDatabaseUrl,
    ready.dbUrl,
  );
  await writeAgentEnvFile(envAction, ready.dbUrl, assertNativeStackDatabaseUrl);
  const report = await collectNativeStatus(ready.dbUrl);
  printNativeStatus(ready, report);
  if (!nativeStatusPassed(ready, report)) fail(failure);
}

async function runPreflight(): Promise<void> {
  await assertEnvironmentBoundary(assertNativeStackDatabaseUrl);
  await assertNativeHost();
  log(`Host ${process.platform} ${process.arch} supports the native runtime.`);
  await assertGithubReachable();
  log('github.com is reachable for the native runtime artifacts.');

  const pnpmVersion = runQuiet('pnpm', ['--version']);
  const supabaseVersion = runQuiet('pnpm', ['exec', 'supabase', '--version']);
  log(
    `Node ${process.version}; pnpm ${pnpmVersion}; Supabase CLI ${supabaseVersion}.`,
  );

  const stack = readStackStatus();
  if (stack) {
    printStackStatus(stack);
  } else {
    log(
      'No native stack exists for this checkout yet; pnpm db agent up creates it.',
    );
  }
  log('Preflight PASS.');
}

async function runUp(): Promise<void> {
  await assertEnvironmentBoundary(assertNativeStackDatabaseUrl);
  await assertNativeHost();
  await startNativeStack();
  requireReadyStack();
  requireSupabase(['migration', 'up', '--local'], { progress: true });
  await finishProvisioning(
    requireReadyStack(),
    'Database provisioning did not pass status checks.',
  );
}

async function runReset(): Promise<void> {
  await assertEnvironmentBoundary(assertNativeStackDatabaseUrl);
  await assertNativeHost();
  await startNativeStack();
  requireReadyStack();
  requireSupabase(['db', 'reset', '--local', '--yes'], { progress: true });
  await finishProvisioning(
    requireReadyStack(),
    'Database reset did not pass status checks.',
  );
}

async function runStatus(): Promise<void> {
  await assertEnvironmentBoundary(assertNativeStackDatabaseUrl);
  const stack = readStackStatus();
  if (!stack) {
    fail('No native stack exists for this checkout; run pnpm db agent up.');
  }
  if (stack.readiness !== 'ready' || !stack.dbUrl) {
    printStackStatus(stack);
    log('overall: FAIL');
    process.exitCode = 1;
    return;
  }
  const report = await collectNativeStatus(
    assertNativeStackDatabaseUrl(stack.dbUrl),
  );
  printNativeStatus(stack, report);
  if (!nativeStatusPassed(stack, report)) process.exitCode = 1;
}

export const COMMANDS: AgentCommands = {
  preflight: { readOnly: true, run: runPreflight },
  reset: { readOnly: false, run: runReset },
  status: { readOnly: true, run: runStatus },
  up: { readOnly: false, run: runUp },
};
