import {
  getPostgresHostname,
  isLocalPostgresHostname,
} from './local-postgres-host';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import postgres from 'postgres';

const ENV_FILE = '.env.local';
const ENV_KEYS = ['POSTGRES_URL', 'POSTGRES_URL_NON_POOLING'] as const;

export type NativeStackStatus = {
  runtime: string | undefined;
  readiness: string | undefined;
  dbUrl: string | undefined;
};

function supabase(args: string[]): string {
  return execFileSync('pnpm', ['exec', 'supabase', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** Reads the current worktree's stack from `supabase status --output-format json`. */
export function readStackStatus(): NativeStackStatus {
  const parsed = JSON.parse(
    supabase(['status', '--output-format', 'json']),
  ) as {
    runtime?: string;
    readiness?: string;
    env?: { DB_URL?: string };
  };
  return {
    runtime: parsed.runtime,
    readiness: parsed.readiness,
    dbUrl: parsed.env?.DB_URL,
  };
}

function assertLocalUrl(url: string, label: string): void {
  const hostname = getPostgresHostname(url);
  if (hostname === null || !isLocalPostgresHostname(hostname)) {
    throw new Error(
      `Refusing to use non-local database for ${label} (host: ${hostname ?? 'unparseable'}).`,
    );
  }
}

function assignedKey(line: string): string | undefined {
  const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
  return match?.[1];
}

function assignedValue(line: string): string {
  return line
    .slice(line.indexOf('=') + 1)
    .trim()
    .replace(/^(['"])(.*)\1$/, '$2');
}

/**
 * Points `.env.local` at this worktree's stack. Replaces every assignment of
 * the managed keys with one line each, preserves every other line, refuses
 * hosted URLs, writes the file owner-only (0600), and detaches a symlinked
 * file (worktree bootstrap) so the main checkout's file is never modified.
 */
export function writeStackEnvLocal(dbUrl: string, envFile = ENV_FILE): void {
  assertLocalUrl(dbUrl, 'the stack URL');

  const isLink = existsSync(envFile) && lstatSync(envFile).isSymbolicLink();
  const content = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';

  const lines = content === '' ? [] : content.replace(/\n$/, '').split('\n');
  const managed = new Set<string>(ENV_KEYS);
  for (const line of lines) {
    const key = assignedKey(line);
    if (key === undefined || !managed.has(key)) continue;
    const existing = assignedValue(line);
    if (existing && existing !== dbUrl) {
      assertLocalUrl(existing, `existing ${key} in ${envFile}`);
    }
  }

  const kept = lines.filter((line) => {
    const key = assignedKey(line);
    return key === undefined || !managed.has(key);
  });
  for (const key of ENV_KEYS) kept.push(`${key}=${dbUrl}`);

  if (isLink) {
    const target = realpathSync(envFile);
    rmSync(envFile);
    copyFileSync(target, envFile);
  }
  writeFileSync(envFile, `${kept.join('\n')}\n`, { mode: 0o600 });
  chmodSync(envFile, 0o600);
  console.log(`[db] ${envFile} now points at this worktree's stack.`);
}

function adminUrl(dbUrl: string): string {
  const url = new URL(dbUrl);
  url.username = 'supabase_admin';
  return url.toString();
}

/**
 * supabase/cli#6977: pg_cron cannot reach the socket-only native Postgres
 * unless it runs as a background worker, and `db reset` reverts that setting.
 */
export async function ensurePgCronBackgroundWorkers(
  dbUrl: string,
): Promise<void> {
  assertLocalUrl(dbUrl, 'the pg_cron workaround');
  const sql = postgres(adminUrl(dbUrl), { max: 1 });
  try {
    const [row] = await sql<
      { value: string }[]
    >`SELECT current_setting('cron.use_background_workers', true) AS value`;
    if (row?.value === 'on') return;
    await sql`ALTER SYSTEM SET cron.use_background_workers = on`;
  } finally {
    await sql.end();
  }
  console.log('[db] Enabling pg_cron background workers (restarting stack)...');
  supabase(['stack', 'restart']);
}

/**
 * Post-start/reset hook. Start writes `.env.local` on any runtime (the stack
 * port is dynamic either way); the pg_cron workaround is native-only.
 */
export async function finishLocalStack(
  options: { writeEnv: boolean } = { writeEnv: false },
): Promise<void> {
  const { runtime, dbUrl } = readStackStatus();
  const native = runtime === 'native';
  if (!options.writeEnv && !native) return;
  if (!dbUrl) {
    throw new Error('supabase status did not report env.DB_URL.');
  }
  if (options.writeEnv) writeStackEnvLocal(dbUrl);
  if (native) await ensurePgCronBackgroundWorkers(dbUrl);
}

export const SAVED_PORT_ERROR = 'endpoints.sql.port cannot change';

export const SAVED_PORT_FIX = [
  '[db] This stack was saved with the old fixed ports and cannot change them.',
  "     One-time fix (deletes this stack's local data, then `pnpm db start` recreates it):",
  '       pnpm exec supabase stack destroy --yes',
].join('\n');
