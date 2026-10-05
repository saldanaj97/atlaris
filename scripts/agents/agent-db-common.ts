import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const LOG_PREFIX = '[agent-postgres]';
const ENV_FILE = resolve(process.cwd(), '.env.local');
const SHADOWING_ENV_FILES = [
  '.env',
  '.env.development',
  '.env.development.local',
  '.env.production',
  '.env.production.local',
  '.env.test',
  '.env.test.local',
].map((file) => resolve(process.cwd(), file));
const MIGRATIONS_DIR = resolve(process.cwd(), 'supabase', 'migrations');
const MANAGED_MARKER = '# Managed by pnpm db:agent:up for Cursor Cloud Agents';

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

export type DatabaseEnvironment = Partial<Record<string, string | undefined>>;
/** Validates a database URL against the managed target and returns its normalized form, or throws. */
export type DatabaseUrlGuard = (raw: string) => string;
export type EnvFileAction = 'create' | 'merge' | 'keep';
export type AgentCommand = 'preflight' | 'reset' | 'status' | 'up';
export type AgentCommands = Record<
  AgentCommand,
  { readOnly: boolean; run: () => Promise<void> }
>;

export function log(message: string): void {
  console.log(`${LOG_PREFIX} ${message}`);
}

export function fail(message: string): never {
  throw new Error(`${LOG_PREFIX} ${message}`);
}

function redactKey(key: string): string {
  return key.replace(/[^A-Z0-9_]/gi, '');
}

export function assertSafeDatabaseEnvironment(
  environment: DatabaseEnvironment,
  assertUrl: DatabaseUrlGuard,
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
    assertUrl(value);
  }
}

function dotenvValue(content: string, key: string): string | undefined {
  let found = false;
  let result: string | undefined;
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(
      new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=\\s*(.*?)\\s*$`),
    );
    if (!match) continue;
    if (found) {
      fail(`Refusing ${redactKey(key)} because it is assigned more than once.`);
    }
    found = true;
    const value = match[1] ?? '';
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      result = value.slice(1, -1);
      continue;
    }
    result = value;
  }
  return result;
}

function assertSafeEnvFileContent(
  content: string,
  file: string,
  assertUrl: DatabaseUrlGuard,
): void {
  const lower = content.toLowerCase();
  if (
    lower.includes('atlaris-dev') ||
    lower.includes('atlaris-prod') ||
    lower.includes('.supabase.co') ||
    lower.includes('.neon.tech')
  ) {
    fail(`Refusing ${file} because it references a hosted database.`);
  }

  const fileEnvironment = Object.fromEntries(
    [...DATABASE_URL_KEYS, ...HOSTED_SECRET_KEYS].map((key) => [
      key,
      dotenvValue(content, key),
    ]),
  );
  assertSafeDatabaseEnvironment(fileEnvironment, assertUrl);
}

/**
 * Decides how `.env.local` must change. Unsafe content always throws; managed
 * URLs that differ from `expectedUrl` (for example a stale dynamic port) are
 * rewritten rather than kept.
 */
export function inspectAgentEnvFile(
  content: string | null,
  assertUrl: DatabaseUrlGuard,
  expectedUrl?: string,
): EnvFileAction {
  if (content === null) return 'create';

  assertSafeEnvFileContent(content, '.env.local', assertUrl);

  const url = dotenvValue(content, 'POSTGRES_URL');
  const nonPoolingUrl = dotenvValue(content, 'POSTGRES_URL_NON_POOLING');
  if (!url || !nonPoolingUrl) {
    return 'merge';
  }
  const normalizedUrl = assertUrl(url);
  const normalizedNonPoolingUrl = assertUrl(nonPoolingUrl);
  if (expectedUrl !== undefined) {
    const expected = assertUrl(expectedUrl);
    if (normalizedUrl !== expected || normalizedNonPoolingUrl !== expected) {
      return 'merge';
    }
  }
  return 'keep';
}

export function managedEnvFileContent(url: string): string {
  return `${MANAGED_MARKER}\nPOSTGRES_URL=${url}\nPOSTGRES_URL_NON_POOLING=${url}\n`;
}

export function mergeManagedDatabaseUrls(content: string, url: string): string {
  const preserved = content
    .split(/\r?\n/)
    .filter(
      (line) =>
        !/^\s*(?:export\s+)?POSTGRES_URL(?:_NON_POOLING)?\s*=/.test(line),
    )
    .join('\n')
    .trimEnd();

  return `${preserved ? `${preserved}\n` : ''}POSTGRES_URL=${url}\nPOSTGRES_URL_NON_POOLING=${url}\n`;
}

async function readAgentEnvFile(): Promise<string | null> {
  try {
    return await readFile(ENV_FILE, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function assertEnvironmentBoundary(
  assertUrl: DatabaseUrlGuard,
  expectedUrl?: string,
): Promise<EnvFileAction> {
  assertSafeDatabaseEnvironment(process.env, assertUrl);
  for (const file of SHADOWING_ENV_FILES) {
    const content = await readFile(file, 'utf8').catch((error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    });
    if (content !== null) {
      assertSafeEnvFileContent(content, basename(file), assertUrl);
    }
  }
  return inspectAgentEnvFile(await readAgentEnvFile(), assertUrl, expectedUrl);
}

export async function writeAgentEnvFile(
  action: EnvFileAction,
  url: string,
  assertUrl: DatabaseUrlGuard,
): Promise<void> {
  if (action === 'keep') return;
  const content =
    action === 'create'
      ? managedEnvFileContent(url)
      : mergeManagedDatabaseUrls(await readFile(ENV_FILE, 'utf8'), url);
  try {
    await writeFile(ENV_FILE, content, {
      encoding: 'utf8',
      flag: action === 'create' ? 'wx' : 'w',
      mode: 0o600,
    });
  } catch (error) {
    if (
      action !== 'create' ||
      (error as NodeJS.ErrnoException).code !== 'EEXIST'
    ) {
      throw error;
    }
    if (
      inspectAgentEnvFile(await readAgentEnvFile(), assertUrl, url) !== 'keep'
    ) {
      fail('.env.local changed during startup; rerun the database command.');
    }
    log('Kept the concurrently created safe .env.local.');
    return;
  }
  log(
    `${action === 'create' ? 'Created' : 'Updated'} .env.local with the managed loopback database URLs.`,
  );
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
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

export function unexpectedMigrationVersions(
  expected: string[],
  applied: string[],
): string[] {
  const expectedVersions = new Set(expected);
  return applied.filter((version) => !expectedVersions.has(version));
}
