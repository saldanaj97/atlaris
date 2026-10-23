/**
 * Disposable smoke database in this worktree's named native Supabase stack
 * (`ATLARIS_TEST_DB=native`), the Docker-free alternative to
 * `postgres-container.ts`. The database is recreated empty for each run and
 * dropped afterwards; the stack itself keeps running for the next run.
 */
import {
  createAdminDatabaseUrl,
  createDatabaseUrl,
  dropDatabase,
  recreateDatabase,
} from '@tests/setup/db-provisioning';
import { startNativeTestStack } from '@tests/setup/native-test-stack';

const SMOKE_DB_NAME = 'atlaris_test_smoke';
/** Names this module creates; a drop refuses any other database. */
const SMOKE_DB_NAME_PATTERN = /^atlaris_test_(verify_)?smoke(_\d+)?$/;

export async function createNativeSmokeDatabase(
  name: string = SMOKE_DB_NAME,
): Promise<string> {
  console.log(
    '[smoke] ATLARIS_TEST_DB=native — starting the native Supabase stack "test"…',
  );
  const stackUrl = startNativeTestStack();
  await recreateDatabase(createAdminDatabaseUrl(stackUrl), name);
  return createDatabaseUrl(stackUrl, name);
}

/** The smoke database `connectionUrl` names; throws for any other database. */
export function smokeDatabaseName(connectionUrl: string): string {
  const name = decodeURIComponent(new URL(connectionUrl).pathname.slice(1));
  if (!SMOKE_DB_NAME_PATTERN.test(name)) {
    throw new Error(`Refusing to drop "${name}": not a smoke database`);
  }
  return name;
}

/** Drops the smoke database `connectionUrl` names. */
export async function dropNativeSmokeDatabase(
  connectionUrl: string | null,
): Promise<void> {
  if (!connectionUrl) {
    return;
  }
  const name = smokeDatabaseName(connectionUrl);
  console.log(`[smoke] Dropping ${name}…`);
  await dropDatabase(createAdminDatabaseUrl(connectionUrl), name);
}
