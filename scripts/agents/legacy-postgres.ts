import {
  LOCAL_PRODUCT_TESTING_SEED_AUTH_USER_ID,
  LOCAL_PRODUCT_TESTING_SEED_EMAIL,
  LOCAL_PRODUCT_TESTING_SEED_NAME,
  LOCAL_PRODUCT_TESTING_SEED_USER_ROW_ID,
} from '../../src/lib/config/local-product-testing';
import { AUTHENTICATED_SERVER_OWNED_WRITE_TABLES } from '../../supabase/privileges/authenticated-table-privileges';
import {
  bootstrapDatabase,
  grantRlsPermissions,
} from '../../tests/helpers/db/bootstrap';
import { seedLocalProductTestingUser } from '../../tests/helpers/db/seed-local-product-testing';
import {
  type AgentCommands,
  assertEnvironmentBoundary,
  fail,
  listCommittedMigrationVersions,
  log,
  managedEnvFileContent,
  pathExists,
  unexpectedMigrationVersions,
  writeAgentEnvFile,
} from './agent-db-common';
import { execFileSync, spawnSync } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { Socket } from 'node:net';
import { homedir } from 'node:os';
import { basename, delimiter, join, resolve } from 'node:path';
import postgres from 'postgres';

const AGENT_HOST = '127.0.0.1';
const AGENT_PORT = 55432;
const AGENT_DATABASE = 'atlaris_agent';
const AGENT_ROLE = 'atlaris_agent';
const POSTGRES_SUPERUSER = 'postgres';
const ARCHIVE_MIGRATION = '20260706221000';
const REMOVE_MIGRATION = '20260706222017';
const DATA_ROOT = resolve(
  process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'),
  'atlaris-agent-postgres',
);
const DATA_DIR = join(DATA_ROOT, '17');
const DATA_MARKER = join(DATA_ROOT, '.managed-by-atlaris');
const LOG_FILE = join(DATA_ROOT, 'postgres.log');
export const AGENT_DATABASE_URL = `postgresql://${AGENT_ROLE}@${AGENT_HOST}:${AGENT_PORT}/${AGENT_DATABASE}?sslmode=disable`;
export const AGENT_ENV_FILE_CONTENT = managedEnvFileContent(AGENT_DATABASE_URL);
export const RLS_ROLE_NORMALIZATION_SQL = `
  ALTER ROLE anon NOLOGIN NOSUPERUSER NOBYPASSRLS;
  ALTER ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS;
  ALTER ROLE service_role NOINHERIT NOLOGIN NOSUPERUSER NOBYPASSRLS;
`;

const ADMIN_DATABASE_URL = `postgresql://${POSTGRES_SUPERUSER}@${AGENT_HOST}:${AGENT_PORT}/${AGENT_DATABASE}`;
const ADMIN_MAINTENANCE_URL = `postgresql://${POSTGRES_SUPERUSER}@${AGENT_HOST}:${AGENT_PORT}/postgres`;

type StatusReport = {
  appliedMigrationCount: number;
  archiveBeforeRemoval: boolean;
  missingMigrationCount: number;
  unexpectedMigrationCount: number;
  missingJournalMigrationsPresent: boolean;
  requiredExtensionPresent: boolean;
  requiredFunctionPresent: boolean;
  requiredGrantSafetyPresent: boolean;
  requiredRlsPresent: boolean;
  requiredRolesPresent: boolean;
  seedPresent: boolean;
};

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
    await sql.unsafe(RLS_ROLE_NORMALIZATION_SQL);
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

export function migrationOrderIsSafe(versions: string[]): boolean {
  const archiveIndex = versions.indexOf(ARCHIVE_MIGRATION);
  const removeIndex = versions.indexOf(REMOVE_MIGRATION);

  return archiveIndex >= 0 && removeIndex >= 0 && archiveIndex < removeIndex;
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
            and not rolsuper
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
        exists(
          select 1
          from users
          where id = ${LOCAL_PRODUCT_TESTING_SEED_USER_ROW_ID}::uuid
            and auth_user_id = ${LOCAL_PRODUCT_TESTING_SEED_AUTH_USER_ID}
            and email = ${LOCAL_PRODUCT_TESTING_SEED_EMAIL}
            and name = ${LOCAL_PRODUCT_TESTING_SEED_NAME}
        ) as seed
    `;
    const missing = expected.filter((version) => !appliedVersions.has(version));
    const unexpected = unexpectedMigrationVersions(
      expected,
      applied.map((row) => row.version),
    );
    const grants = await sql<{ safe: boolean }[]>`
      select
        not exists (
          select 1
          from pg_class class
          join pg_namespace namespace on namespace.oid = class.relnamespace
          cross join (values ('INSERT'), ('UPDATE'), ('DELETE')) p(privilege_type)
          where namespace.nspname = 'public'
            and class.relname = any(${AUTHENTICATED_SERVER_OWNED_WRITE_TABLES})
            and has_table_privilege(
              'authenticated',
              class.oid,
              p.privilege_type
            )
        )
        and not exists (
          select 1
          from pg_class class
          join pg_namespace namespace on namespace.oid = class.relnamespace
          cross join (
            values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
          ) p(privilege_type)
          where namespace.nspname = 'public'
            and class.relkind in ('r', 'p')
            and not exists (
              select 1
              from pg_depend dependency
              where dependency.classid = 'pg_class'::regclass
                and dependency.objid = class.oid
                and dependency.deptype = 'e'
            )
            and has_table_privilege('anon', class.oid, p.privilege_type)
        )
        and not exists (
          select 1
          from information_schema.columns c
          cross join (values ('INSERT'), ('UPDATE'), ('REFERENCES')) p(privilege_type)
          where c.table_schema = 'public'
            and c.table_name = any(${AUTHENTICATED_SERVER_OWNED_WRITE_TABLES})
            and has_column_privilege(
              'authenticated',
              format('public.%I', c.table_name),
              c.column_name,
              p.privilege_type
            )
        )
        and not exists (
          select 1
          from pg_class class
          join pg_namespace namespace on namespace.oid = class.relnamespace
          join information_schema.columns c
            on c.table_schema = namespace.nspname
           and c.table_name = class.relname
          cross join (values ('INSERT'), ('UPDATE'), ('REFERENCES')) p(privilege_type)
          where namespace.nspname = 'public'
            and class.relkind in ('r', 'p')
            and not exists (
              select 1
              from pg_depend dependency
              where dependency.classid = 'pg_class'::regclass
                and dependency.objid = class.oid
                and dependency.deptype = 'e'
            )
            and has_column_privilege(
              'anon',
              class.oid,
              c.column_name,
              p.privilege_type
            )
        ) as safe
    `;
    const rls = await sql<{ safe: boolean }[]>`
      select not exists (
        select 1
        from pg_class class
        join pg_namespace namespace on namespace.oid = class.relnamespace
        where namespace.nspname = 'public'
          and class.relkind in ('r', 'p')
          and not exists (
            select 1
            from pg_depend dependency
            where dependency.classid = 'pg_class'::regclass
              and dependency.objid = class.oid
              and dependency.deptype = 'e'
          )
          and not class.relrowsecurity
      )
      and not exists (
        select 1
        from pg_policies policy
        cross join lateral unnest(policy.roles) policy_role(role_name)
        where policy.schemaname = 'public'
          and policy.permissive = 'PERMISSIVE'
          and lower(policy_role.role_name::text) in ('public', 'anon')
      ) as safe
    `;

    return {
      appliedMigrationCount: appliedVersions.size,
      archiveBeforeRemoval:
        migrationOrderIsSafe(expected) &&
        appliedVersions.has(ARCHIVE_MIGRATION) &&
        appliedVersions.has(REMOVE_MIGRATION),
      missingMigrationCount: missing.length,
      unexpectedMigrationCount: unexpected.length,
      missingJournalMigrationsPresent:
        appliedVersions.has('20260520194501') &&
        appliedVersions.has(ARCHIVE_MIGRATION),
      requiredExtensionPresent: compatibility[0]?.pgcrypto === true,
      requiredFunctionPresent: compatibility[0]?.auth_jwt === true,
      requiredGrantSafetyPresent: grants[0]?.safe === true,
      requiredRlsPresent: rls[0]?.safe === true,
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
    report.unexpectedMigrationCount === 0 &&
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
  log(`unexpected migrations: ${report.unexpectedMigrationCount}`);
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
  await assertEnvironmentBoundary(assertManagedAgentDatabaseUrl);
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

  await assertManagedDataDirectory();
  if (await postgresReady()) {
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
  const envAction = await assertEnvironmentBoundary(
    assertManagedAgentDatabaseUrl,
  );
  assertManagedAgentDatabaseUrl(AGENT_DATABASE_URL);
  await startPostgres();
  await provisionDatabase();
  await writeAgentEnvFile(
    envAction,
    AGENT_DATABASE_URL,
    assertManagedAgentDatabaseUrl,
  );
  const report = await collectStatus();
  printStatus(report);
  if (!statusPassed(report))
    fail('Database provisioning did not pass status checks.');
}

async function runReset(): Promise<void> {
  const envAction = await assertEnvironmentBoundary(
    assertManagedAgentDatabaseUrl,
  );
  assertManagedAgentDatabaseUrl(AGENT_DATABASE_URL);
  await startPostgres();
  await ensureRoleAndDatabase();
  await resetDatabase();
  await writeAgentEnvFile(
    envAction,
    AGENT_DATABASE_URL,
    assertManagedAgentDatabaseUrl,
  );
  const report = await collectStatus();
  printStatus(report);
  if (!statusPassed(report)) fail('Database reset did not pass status checks.');
}

async function runStatus(): Promise<void> {
  await assertEnvironmentBoundary(assertManagedAgentDatabaseUrl);
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

export const COMMANDS: AgentCommands = {
  preflight: { readOnly: true, run: runPreflight },
  reset: { readOnly: false, run: runReset },
  status: { readOnly: true, run: runStatus },
  up: { readOnly: false, run: runUp },
};
