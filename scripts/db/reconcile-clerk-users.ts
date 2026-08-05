import {
  getPostgresHostname,
  isLocalPostgresHostname,
} from './local-postgres-host';
import { reconcileClerkUserIdentities } from '@/features/auth/clerk-user-projection';
import { createLogger } from '@/lib/logging/logger';
import { clerkClient as getClerkClient } from '@clerk/nextjs/server';
import { db as serviceRoleDb } from '@supabase/service-role';
import { existsSync } from 'node:fs';

type ReconciliationArgs = {
  apply: boolean;
  allowNonLocal: boolean;
};

function usage(): never {
  console.error(
    [
      'Usage:',
      '  pnpm clerk:user:reconcile',
      '  pnpm clerk:user:reconcile -- --apply',
      '  pnpm clerk:user:reconcile -- --allow-non-local true',
      '  pnpm clerk:user:reconcile -- --apply --allow-non-local true',
      '',
      'The default is dry-run. Non-local targets require --allow-non-local true.',
    ].join('\n'),
  );
  process.exit(1);
}

function parseArgs(argv: string[]): ReconciliationArgs {
  const args: ReconciliationArgs = { apply: false, allowNonLocal: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply' && !args.apply) {
      args.apply = true;
      continue;
    }
    if (
      arg === '--allow-non-local' &&
      !args.allowNonLocal &&
      argv[index + 1] === 'true'
    ) {
      args.allowNonLocal = true;
      index += 1;
      continue;
    }
    usage();
  }

  return args;
}

function resolveDatabaseUrl(): string {
  const value = process.env.POSTGRES_URL?.trim();
  if (!value) {
    throw new Error('POSTGRES_URL is required to reconcile Clerk users.');
  }
  return value;
}

function assertTargetDatabase(
  connectionUrl: string,
  allowNonLocal: boolean,
): string {
  const hostname = getPostgresHostname(connectionUrl);
  if (hostname === null) {
    throw new Error(
      'Invalid POSTGRES_URL: could not parse hostname (expected a postgresql:// URL).',
    );
  }
  if (!isLocalPostgresHostname(hostname) && !allowNonLocal) {
    throw new Error(
      `Refusing to reconcile non-local database (host: ${hostname}). Pass "--allow-non-local true" after verifying the target credentials.`,
    );
  }
  return hostname;
}

async function main(): Promise<void> {
  if (!process.env.CI && existsSync('.env.local')) {
    process.loadEnvFile('.env.local');
  }

  const args = parseArgs(process.argv.slice(2));
  const hostname = assertTargetDatabase(
    resolveDatabaseUrl(),
    args.allowNonLocal,
  );
  const mode = args.apply ? 'APPLY' : 'DRY RUN';
  console.log(`[clerk:user:reconcile] ${mode}; database host: ${hostname}`);

  const clerkClient = await getClerkClient();
  const logger = createLogger({ script: 'reconcile-clerk-users', mode });
  const total = {
    checked: 0,
    updated: 0,
    tombstoned: 0,
    wouldUpdate: 0,
    wouldTombstone: 0,
    skipped: 0,
    ignored: 0,
    failed: 0,
  };
  let cursor: string | undefined;

  do {
    const page = await reconcileClerkUserIdentities({
      apply: args.apply,
      clerkClient,
      db: serviceRoleDb,
      logger,
      startingAfterAuthUserId: cursor,
    });
    total.checked += page.checked;
    total.updated += page.updated;
    total.tombstoned += page.tombstoned;
    total.wouldUpdate += page.wouldUpdate;
    total.wouldTombstone += page.wouldTombstone;
    total.skipped += page.skipped;
    total.ignored += page.ignored;
    total.failed += page.failed;
    cursor = page.nextCursor ?? undefined;
  } while (cursor);

  console.log(JSON.stringify({ mode, ...total }, null, 2));
  if (total.failed > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
