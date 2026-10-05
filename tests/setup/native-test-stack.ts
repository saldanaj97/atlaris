/**
 * Opt-in native Supabase test database (`ATLARIS_TEST_DB=native`).
 *
 * Starts or resumes this worktree's named native stack (`supabase start
 * --stack test --runtime native`) and returns its local database URL. The
 * stack identity is project root + git branch + stack name, so each worktree
 * gets its own data directory and dynamic port. The tests never `db reset`
 * this stack; the bootstrap builds its own `atlaris_test_*` databases in it.
 */

import {
  getPostgresHostname,
  isLocalPostgresHostname,
} from '../../scripts/db/local-postgres-host';
import { execFileSync } from 'node:child_process';
import { z } from 'zod';

export const TEST_DB_ENV = 'ATLARIS_TEST_DB';
export const NATIVE_TEST_DB = 'native';
export const NATIVE_TEST_STACK_NAME = 'test';

const NativeStackStatusSchema = z.object({
  env: z.object({ DB_URL: z.string().min(1) }),
});

export type SupabaseCliRunner = (args: readonly string[]) => string;

/** True when `ATLARIS_TEST_DB=native`; unset or empty keeps the default path. */
export function isNativeTestDbEnabled(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): boolean {
  const value = env[TEST_DB_ENV]?.trim();
  if (!value) return false;
  if (value === NATIVE_TEST_DB) return true;
  throw new Error(
    `${TEST_DB_ENV} must be unset or "${NATIVE_TEST_DB}", got "${value}"`,
  );
}

/** Read `env.DB_URL` from `supabase status --output-format json` output. */
export function parseNativeTestStackDbUrl(statusJson: string): string {
  const status = NativeStackStatusSchema.parse(JSON.parse(statusJson));
  const dbUrl = status.env.DB_URL;
  const hostname = getPostgresHostname(dbUrl);

  if (!hostname || !isLocalPostgresHostname(hostname)) {
    throw new Error(
      `Native test stack reported a non-local PostgreSQL host "${hostname ?? dbUrl}"`,
    );
  }

  return dbUrl;
}

function runSupabaseCli(args: readonly string[]): string {
  // stdout carries JSON with local stack keys; keep it captured and let
  // progress and errors on stderr reach the terminal.
  return execFileSync('pnpm', ['exec', 'supabase', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

/** Start or resume the named native stack and return its database URL. */
export function startNativeTestStack(
  runCli: SupabaseCliRunner = runSupabaseCli,
): string {
  runCli([
    'start',
    '--stack',
    NATIVE_TEST_STACK_NAME,
    '--runtime',
    'native',
    '--output-format',
    'json',
  ]);

  return parseNativeTestStackDbUrl(
    runCli([
      'status',
      '--stack',
      NATIVE_TEST_STACK_NAME,
      '--output-format',
      'json',
    ]),
  );
}
