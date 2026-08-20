import { AUTHENTICATED_SERVER_OWNED_WRITE_TABLES } from '../../supabase/privileges/authenticated-table-privileges';
import {
  bootstrapDatabase,
  grantRlsPermissions,
} from '../../tests/helpers/db/bootstrap';
import { seedLocalProductTestingUser } from '../../tests/helpers/db/seed-local-product-testing';
import { execFileSync, spawnSync } from 'node:child_process';
import { constants } from 'node:fs';
import {
  access,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises';
import { Socket } from 'node:net';
import { homedir } from 'node:os';
import { basename, delimiter, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';

const LOG_PREFIX = '[agent-postgres]';
const AGENT_HOST = '127.0.0.1';
const AGENT_PORT = 55432;
const AGENT_DATABASE = 'atlaris_agent';
const AGENT_ROLE = 'atlaris_agent';
const POSTGRES_SUPERUSER = 'postgres';
const SEED_USER_ID = '11111111-1111-4111-8111-111111111111';
const ARCHIVE_MIGRATION = '20260706221000';
const REMOVE_MIGRATION = '20260706222017';
const DATA_ROOT = resolve(
  process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'),
  'atlaris-agent-postgres',
);
const DATA_DIR = join(DATA_ROOT, '17');
const DATA_MARKER = join(DATA_ROOT, '.managed-by-atlaris');
const LOG_FILE = join(DATA_ROOT, 'postgres.log');
const ENV_FILE = resolve(process.cwd(), '.env.local');
const MIGRATIONS_DIR = resolve(process.cwd(), 'supabase', 'migrations');
const MANAGED_MARKER = '# Managed by pnpm db:agent:up for Cursor Cloud Agents';

export const AGENT_DATABASE_URL = `postgresql://${AGENT_ROLE}@${AGENT_HOST}:${AGENT_PORT}/${AGENT_DATABASE}?sslmode=disable`;
export const AGENT_ENV_FILE_CONTENT = `${MANAGED_MARKER}\nPOSTGRES_URL=${AGENT_DATABASE_URL}\nPOSTGRES_URL_NON_POOLING=${AGENT_DATABASE_URL}\n`;

const ADMIN_DATABASE_URL = `postgresql://${POSTGRES_SUPERUSER}@${AGENT_HOST}:${AGENT_PORT}/${AGENT_DATABASE}`;
const ADMIN_MAINTENANCE_URL = `postgresql://${POSTGRES_SUPERUSER}@${AGENT_HOST}:${AGENT_PORT}/postgres`;

const DATABASE_URL_KEYS = [
  'POSTGRES_URL',
  'POSTGRES_URL_NON_POOLING',
  'DATABASE_URL',
  'SUPABASE_DB_URL',
] as const;
const HOSTED_SECRET_KEYS = [
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_PASSWORD',
] as const;

type DatabaseEnvironment = Partial<Record<string, string | undefined>>;
type AgentCommand = 'preflight' | 'reset' | 'status' | 'up';
type StatusReport = {
  appliedMigrationCount: number;
  archiveBeforeRemoval: boolean;
  missingMigrationCount: number;
  missingJournalMigrationsPresent: boolean;
  requiredExtensionPresent: boolean;
  requiredFunctionPresent: boolean;
  requiredGrantSafetyPresent: boolean;
  requiredRlsPresent: boolean;
  requiredRolesPresent: boolean;
  seedPresent: boolean;
};

function log(message: string): void {
  console.log(`${LOG_PREFIX} ${message}`);
}

function fail(message: string): never {
  throw new Error(`${LOG_PREFIX} ${message}`);
}

function redactKey(key: string): string {
  return key.replace(/[^A-Z0-9_]/gi, '');
}

export function assertManagedAgentDatabaseUrl(raw: string): string {
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
  if (host !== AGENT_HOST && host !== 'localhost') {
    return fail(
      'Refusing a database host outside the managed loopback target.',
    );
  }
  if (url.port !== String(AGENT_PORT)) {
    return fail(`Refusing a database port other than ${AGENT_PORT}.`);
  }
  if (decodeURIComponent(url.pathname) !== `/${AGENT_DATABASE}`) {
    return fail(`Refusing a database other than ${AGENT_DATABASE}.`);
  }
  if (decodeURIComponent(url.username) !== AGENT_ROLE) {
    return fail(`Refusing a database role other than ${AGENT_ROLE}.`);
  }
  if (
    url.password ||
    url.hash ||
    url.searchParams.size !== 1 ||
    url.searchParams.get('sslmode') !== 'disable'
  ) {
    return fail(
      'Refusing credentials or unexpected URL options on the managed target.',
    );
  }

  return AGENT_DATABASE_URL;
}

export function assertSafeDatabaseEnvironment(
  environment: DatabaseEnvironment,
): void {
  for (const key of HOSTED_SECRET_KEYS) {
    if (environment[key]?.trim()) {
      fail(`Refusing to run while hosted credential ${redactKey(key)} is set.`);
    }
  }

  for (const key of DATABASE_URL_KEYS) {
    const value = environment[key]?.trim();
    if (!value) continue;

    if (key !== 'POSTGRES_URL' && key !== 'POSTGRES_URL_NON_POOLING') {
      fail(`Refusing to run while ${redactKey(key)} is set.`);
    }
    assertManagedAgentDatabaseUrl(value);
  }
}

function dotenvValue(content: string, key: string): string | undefined {
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(
      new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=\\s*(.*?)\\s*$`),
    );
    if (!match) continue;
    const value = match[1] ?? '';
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }
    return value;
  }
  return undefined;
}

export function inspectAgentEnvFile(content: string | null): 'create' | 'keep' {
  if (content === null) return 'create';

  const lower = content.toLowerCase();
  if (
    lower.includes('atlaris-dev') ||
    lower.includes('atlaris-prod') ||
    lower.includes('.supabase.co') ||
    lower.includes('.neon.tech')
  ) {
    return fail('Refusing a .env.local that references a hosted database.');
  }

  const fileEnvironment = Object.fromEntries(
    [...DATABASE_URL_KEYS, ...HOSTED_SECRET_KEYS].map((key) => [
      key,
      dotenvValue(content, key),
    ]),
  );
  assertSafeDatabaseEnvironment(fileEnvironment);

  const url = dotenvValue(content, 'POSTGRES_URL');
  const nonPoolingUrl = dotenvValue(content, 'POSTGRES_URL_NON_POOLING');
  if (!url || !nonPoolingUrl) {
    return fail(
      '.env.local already exists without both managed database URLs; will not overwrite it.',
    );
  }
  assertManagedAgentDatabaseUrl(url);
  assertManagedAgentDatabaseUrl(nonPoolingUrl);
  return 'keep';
}

async function readAgentEnvFile(): Promise<string | null> {
  try {
    return await readFile(ENV_FILE, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function assertEnvironmentBoundary(): Promise<'create' | 'keep'> {
  assertSafeDatabaseEnvironment(process.env);
  return inspectAgentEnvFile(await readAgentEnvFile());
}

async function writeAgentEnvFileIfAbsent(
  action: 'create' | 'keep',
): Promise<void> {
  if (action === 'keep') return;
  await writeFile(ENV_FILE, AGENT_ENV_FILE_CONTENT, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
  log(
    'Created cloud-owned .env.local with the managed loopback database URLs.',
  );
}

function binaryCandidates(name: string): string[] {
  return [
    ...(process.env.PATH || '')
      .split(delimiter)
      .map((entry) => join(entry, name)),
    join('/usr/lib/postgresql/17/bin', name),
  ];
}

async function findBinary(name: string): Promise<string | null> {
  for (const candidate of binaryCandidates(name)) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next known location.
    }
  }
  return null;
}

async function requireBinary(name: string): Promise<string> {
  const binary = await findBinary(name);
  if (!binary) {
    return fail(
      `${name} is missing. Run ./scripts/agents/install-postgres-17.sh first.`,
    );
  }
  return binary;
}

function run(
  binary: string,
  args: string[],
  options?: { quiet?: boolean },
): string {
  try {
    const output = execFileSync(binary, args, {
      encoding: 'utf8',
      stdio: options?.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    return typeof output === 'string' ? output.trim() : '';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(`${basename(binary)} failed: ${message}`);
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function assertManagedDataDirectory(): Promise<void> {
  if (!(await pathExists(DATA_DIR))) return;
  let marker: string;
  try {
    marker = (await readFile(DATA_MARKER, 'utf8')).trim();
  } catch {
    return fail(`Refusing unknown PostgreSQL data directory at ${DATA_DIR}.`);
  }
  if (marker !== DATA_DIR) {
    return fail(
      `Refusing PostgreSQL data directory with an invalid ownership marker.`,
    );
  }
}

async function initializeCluster(): Promise<void> {
  await assertManagedDataDirectory();
  if (await pathExists(DATA_DIR)) return;

  const initdb = await requireBinary('initdb');
  await mkdir(DATA_ROOT, { recursive: true, mode: 0o700 });
  run(initdb, [
    '--pgdata',
    DATA_DIR,
    '--username',
    POSTGRES_SUPERUSER,
    '--auth-local=trust',
    '--auth-host=trust',
    '--encoding=UTF8',
    '--no-locale',
  ]);
  await writeFile(DATA_MARKER, `${DATA_DIR}\n`, { mode: 0o600 });
  log('Initialized the managed PostgreSQL 17 data directory.');
}

async function postgresReady(): Promise<boolean> {
  const pgIsReady = await findBinary('pg_isready');
  if (!pgIsReady) return false;
  return (
    spawnSync(pgIsReady, [
      '--host',
      AGENT_HOST,
      '--port',
      String(AGENT_PORT),
      '--username',
      POSTGRES_SUPERUSER,
      '--dbname',
      'postgres',
    ]).status === 0
  );
}

async function portInUse(): Promise<boolean> {
  return new Promise((resolvePort) => {
    const socket = new Socket();
    const finish = (inUse: boolean) => {
      socket.destroy();
      resolvePort(inUse);
    };
    socket.setTimeout(500);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(AGENT_PORT, AGENT_HOST);
  });
}

async function assertRunningManagedCluster(): Promise<void> {
  const sql = postgres(ADMIN_MAINTENANCE_URL, { max: 1, connect_timeout: 3 });
  try {
    const [row] = await sql<
      { data_directory: string; server_version: string }[]
    >`
      select current_setting('data_directory')::text as data_directory,
             current_setting('server_version')::text as server_version
    `;
    if (!row || resolve(row.data_directory) !== DATA_DIR) {
      fail(
        `Port ${AGENT_PORT} is not served by the managed Atlaris data directory.`,
      );
    }
    if (!row.server_version.startsWith('17.')) {
      fail(`The managed server must run PostgreSQL 17.`);
    }
  } finally {
    await sql.end();
  }
}

async function startPostgres(): Promise<void> {
  await assertManagedDataDirectory();
  if (await postgresReady()) {
    await assertRunningManagedCluster();
    return;
  }
  if (await portInUse()) {
    fail(
      `Loopback port ${AGENT_PORT} is already in use by an unmanaged service.`,
    );
  }

  await initializeCluster();
  const pgCtl = await requireBinary('pg_ctl');
  run(pgCtl, [
    '--pgdata',
    DATA_DIR,
    '--log',
    LOG_FILE,
    '--options',
    `-h ${AGENT_HOST} -p ${AGENT_PORT} -c unix_socket_directories=/tmp`,
    '--wait',
    'start',
  ]);
  if (!(await postgresReady())) {
    fail(`PostgreSQL did not become ready on ${AGENT_HOST}:${AGENT_PORT}.`);
  }
  await assertRunningManagedCluster();
  log(`PostgreSQL 17 is ready on ${AGENT_HOST}:${AGENT_PORT}.`);
}

async function ensureRoleAndDatabase(): Promise<void> {
  const sql = postgres(ADMIN_MAINTENANCE_URL, { max: 1 });
  try {
    const roles = await sql<{ exists: boolean }[]>`
      select exists(select 1 from pg_roles where rolname = ${AGENT_ROLE})
    `;
    if (!roles[0]?.exists) {
      await sql.unsafe(`CREATE ROLE ${AGENT_ROLE} LOGIN SUPERUSER BYPASSRLS`);
    }
    await sql.unsafe(`ALTER ROLE ${AGENT_ROLE} LOGIN SUPERUSER BYPASSRLS`);

    const databases = await sql<{ exists: boolean }[]>`
      select exists(select 1 from pg_database where datname = ${AGENT_DATABASE})
    `;
    if (!databases[0]?.exists) {
      await sql.unsafe(`CREATE DATABASE ${AGENT_DATABASE} OWNER ${AGENT_ROLE}`);
    }
  } finally {
    await sql.end();
  }
}

async function bootstrapCompatibility(): Promise<void> {
  await bootstrapDatabase(ADMIN_DATABASE_URL);
  const sql = postgres(ADMIN_DATABASE_URL, { max: 1 });
  try {
    await sql.unsafe(
      `GRANT anon, authenticated, service_role TO ${AGENT_ROLE}`,
    );
  } finally {
    await sql.end();
  }
}

function applyMigrations(): void {
  run('pnpm', [
    'exec',
    'supabase',
    'db',
    'push',
    '--db-url',
    AGENT_DATABASE_URL,
    '--include-all',
    '--yes',
  ]);
}

export async function listCommittedMigrationVersions(
  migrationsDir = MIGRATIONS_DIR,
): Promise<string[]> {
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  const versions = files.map((file) => file.split('_', 1)[0] ?? '');
  if (versions.some((version) => !/^\d+$/.test(version))) {
    return fail('Every committed migration must start with a numeric version.');
  }
  if (new Set(versions).size !== versions.length) {
    return fail('Committed migration versions must be unique.');
  }
  return versions;
}

export function migrationOrderIsSafe(versions: string[]): boolean {
  const archiveIndex = versions.indexOf(ARCHIVE_MIGRATION);
  const removeIndex = versions.indexOf(REMOVE_MIGRATION);

  return archiveIndex >= 0 && removeIndex >= 0 && archiveIndex < removeIndex;
}

export function assertNoTargetArguments(args: string[]): void {
  if (args.length > 0) {
    fail('Database lifecycle commands do not accept URL or target arguments.');
  }
}

async function collectStatus(): Promise<StatusReport> {
  const expected = await listCommittedMigrationVersions();
  const sql = postgres(AGENT_DATABASE_URL, { max: 1, connect_timeout: 3 });
  try {
    const applied = await sql<{ version: string }[]>`
      select version::text
      from supabase_migrations.schema_migrations
      order by version
    `;
    const appliedVersions = new Set(applied.map((row) => row.version));
    const roles = await sql<{ safe: boolean }[]>`
      select
        count(*) filter (
          where rolname in ('anon', 'authenticated', 'service_role')
            and not rolcanlogin
            and not rolbypassrls
        ) = 3
        and count(*) filter (
          where rolname = ${AGENT_ROLE}
            and rolcanlogin
            and rolsuper
            and rolbypassrls
        ) = 1
        and pg_has_role(${AGENT_ROLE}, 'anon', 'MEMBER')
        and pg_has_role(${AGENT_ROLE}, 'authenticated', 'MEMBER')
        as safe
      from pg_roles
    `;
    const compatibility = await sql<
      {
        auth_jwt: boolean;
        pgcrypto: boolean;
        seed: boolean;
      }[]
    >`
      select
        to_regprocedure('auth.jwt()') is not null as auth_jwt,
        exists(select 1 from pg_extension where extname = 'pgcrypto') as pgcrypto,
        exists(select 1 from users where id = ${SEED_USER_ID}::uuid) as seed
    `;
    const missing = expected.filter((version) => !appliedVersions.has(version));
    const grants = await sql<{ safe: boolean }[]>`
      select
        not exists (
          select 1
          from information_schema.table_privileges
          where table_schema = 'public'
            and grantee = 'authenticated'
            and table_name = any(${AUTHENTICATED_SERVER_OWNED_WRITE_TABLES})
            and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
        )
        and not exists (
          select 1
          from information_schema.table_privileges
          where table_schema = 'public'
            and grantee = 'anon'
            and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
        ) as safe
    `;
    const rls = await sql<{ count: number }[]>`
      select count(*)::int as count
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('users', 'learning_plans', 'task_progress')
        and c.relrowsecurity
    `;

    return {
      appliedMigrationCount: appliedVersions.size,
      archiveBeforeRemoval:
        migrationOrderIsSafe(expected) &&
        appliedVersions.has(ARCHIVE_MIGRATION) &&
        appliedVersions.has(REMOVE_MIGRATION),
      missingMigrationCount: missing.length,
      missingJournalMigrationsPresent:
        appliedVersions.has('20260520194501') &&
        appliedVersions.has(ARCHIVE_MIGRATION),
      requiredExtensionPresent: compatibility[0]?.pgcrypto === true,
      requiredFunctionPresent: compatibility[0]?.auth_jwt === true,
      requiredGrantSafetyPresent: grants[0]?.safe === true,
      requiredRlsPresent: rls[0]?.count === 3,
      requiredRolesPresent: roles[0]?.safe === true,
      seedPresent: compatibility[0]?.seed === true,
    };
  } finally {
    await sql.end();
  }
}

function statusPassed(report: StatusReport): boolean {
  return (
    report.archiveBeforeRemoval &&
    report.missingMigrationCount === 0 &&
    report.missingJournalMigrationsPresent &&
    report.requiredExtensionPresent &&
    report.requiredFunctionPresent &&
    report.requiredGrantSafetyPresent &&
    report.requiredRlsPresent &&
    report.requiredRolesPresent &&
    report.seedPresent
  );
}

function printStatus(report: StatusReport): void {
  log(`managed database: ${AGENT_DATABASE} on ${AGENT_HOST}:${AGENT_PORT}`);
  log(`applied migrations: ${report.appliedMigrationCount}`);
  log(`pending migrations: ${report.missingMigrationCount}`);
  log(
    `Drizzle-journal-missing migrations: ${report.missingJournalMigrationsPresent ? 'present' : 'missing'}`,
  );
  log(`archive before removal: ${report.archiveBeforeRemoval ? 'yes' : 'no'}`);
  log(`required roles: ${report.requiredRolesPresent ? 'present' : 'missing'}`);
  log(`auth.jwt(): ${report.requiredFunctionPresent ? 'present' : 'missing'}`);
  log(`pgcrypto: ${report.requiredExtensionPresent ? 'present' : 'missing'}`);
  log(
    `critical grant safety: ${report.requiredGrantSafetyPresent ? 'present' : 'missing'}`,
  );
  log(`RLS sentinels: ${report.requiredRlsPresent ? 'enabled' : 'missing'}`);
  log(`deterministic seed: ${report.seedPresent ? 'present' : 'missing'}`);
  log(`overall: ${statusPassed(report) ? 'PASS' : 'FAIL'}`);
}

async function provisionDatabase(): Promise<void> {
  await ensureRoleAndDatabase();
  await bootstrapCompatibility();
  applyMigrations();
  await grantRlsPermissions(ADMIN_DATABASE_URL);
  await seedLocalProductTestingUser(AGENT_DATABASE_URL);
}

async function resetDatabase(): Promise<void> {
  await assertManagedDataDirectory();
  const sql = postgres(ADMIN_MAINTENANCE_URL, { max: 1 });
  try {
    await sql`
      select pg_terminate_backend(pid)
      from pg_stat_activity
      where datname = ${AGENT_DATABASE}
        and pid <> pg_backend_pid()
    `;
    await sql.unsafe(`DROP DATABASE IF EXISTS ${AGENT_DATABASE}`);
    await sql.unsafe(`CREATE DATABASE ${AGENT_DATABASE} OWNER ${AGENT_ROLE}`);
  } finally {
    await sql.end();
  }
  await provisionDatabase();
}

async function runPreflight(): Promise<void> {
  await assertEnvironmentBoundary();
  const osRelease = await readFile('/etc/os-release', 'utf8').catch(() => '');
  if (process.platform !== 'linux' || !/^ID=ubuntu$/m.test(osRelease)) {
    fail('Cloud PostgreSQL setup supports Ubuntu Linux only.');
  }

  const sudo =
    typeof process.getuid === 'function' && process.getuid() === 0
      ? true
      : spawnSync('sudo', ['-n', 'true']).status === 0;
  if (!sudo) fail('Passwordless sudo is required to install PostgreSQL 17.');

  for (const binary of ['postgres', 'initdb', 'pg_ctl', 'pg_isready', 'psql']) {
    await requireBinary(binary);
  }
  const postgresBinary = await requireBinary('postgres');
  const postgresVersion = run(postgresBinary, ['--version'], { quiet: true });
  if (!/\b17\./.test(postgresVersion)) fail('PostgreSQL 17 is required.');

  const pnpmVersion = run('pnpm', ['--version'], { quiet: true });
  const supabaseVersion = run('pnpm', ['exec', 'supabase', '--version'], {
    quiet: true,
  });
  log(
    `Node ${process.version}; pnpm ${pnpmVersion}; Supabase CLI ${supabaseVersion}.`,
  );

  if (await postgresReady()) {
    await assertManagedDataDirectory();
    await assertRunningManagedCluster();
    log(`Managed PostgreSQL already owns loopback port ${AGENT_PORT}.`);
  } else if (await portInUse()) {
    fail(
      `Loopback port ${AGENT_PORT} is already in use by an unmanaged service.`,
    );
  } else {
    log(`Loopback port ${AGENT_PORT} is available for the managed server.`);
  }
  log('Preflight PASS.');
}

async function runUp(): Promise<void> {
  const envAction = await assertEnvironmentBoundary();
  assertManagedAgentDatabaseUrl(AGENT_DATABASE_URL);
  await startPostgres();
  await provisionDatabase();
  await writeAgentEnvFileIfAbsent(envAction);
  const report = await collectStatus();
  printStatus(report);
  if (!statusPassed(report))
    fail('Database provisioning did not pass status checks.');
}

async function runReset(): Promise<void> {
  const envAction = await assertEnvironmentBoundary();
  assertManagedAgentDatabaseUrl(AGENT_DATABASE_URL);
  await startPostgres();
  await ensureRoleAndDatabase();
  await resetDatabase();
  await writeAgentEnvFileIfAbsent(envAction);
  const report = await collectStatus();
  printStatus(report);
  if (!statusPassed(report)) fail('Database reset did not pass status checks.');
}

async function runStatus(): Promise<void> {
  await assertEnvironmentBoundary();
  assertManagedAgentDatabaseUrl(AGENT_DATABASE_URL);
  const postgresBinary = await requireBinary('postgres');
  const postgresVersion = run(postgresBinary, ['--version'], { quiet: true });
  const supabaseVersion = run('pnpm', ['exec', 'supabase', '--version'], {
    quiet: true,
  });
  log(`PostgreSQL: ${postgresVersion}; Supabase CLI: ${supabaseVersion}.`);
  if (!(await postgresReady())) fail('Managed PostgreSQL is not ready.');
  await assertManagedDataDirectory();
  await assertRunningManagedCluster();
  const report = await collectStatus();
  printStatus(report);
  if (!statusPassed(report)) process.exitCode = 1;
}

export const COMMANDS: Record<
  AgentCommand,
  { readOnly: boolean; run: () => Promise<void> }
> = {
  preflight: { readOnly: true, run: runPreflight },
  reset: { readOnly: false, run: runReset },
  status: { readOnly: true, run: runStatus },
  up: { readOnly: false, run: runUp },
};

async function main(): Promise<void> {
  const command = process.argv[2] as AgentCommand | undefined;
  if (!command || !(command in COMMANDS)) {
    fail('Usage: cloud-postgres.ts <preflight|up|reset|status>');
  }
  assertNoTargetArguments(process.argv.slice(3));
  await COMMANDS[command].run();
}

const entrypoint = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : '';
if (import.meta.url === entrypoint) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
