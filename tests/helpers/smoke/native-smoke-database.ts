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

export async function createNativeSmokeDatabase(): Promise<string> {
  console.log(
    '[smoke] ATLARIS_TEST_DB=native — starting the native Supabase stack "test"…',
  );
  const stackUrl = startNativeTestStack();
  await recreateDatabase(createAdminDatabaseUrl(stackUrl), SMOKE_DB_NAME);
  return createDatabaseUrl(stackUrl, SMOKE_DB_NAME);
}

export async function dropNativeSmokeDatabase(
  connectionUrl: string | null,
): Promise<void> {
  if (!connectionUrl) {
    return;
  }
  console.log(`[smoke] Dropping ${SMOKE_DB_NAME}…`);
  await dropDatabase(createAdminDatabaseUrl(connectionUrl), SMOKE_DB_NAME);
}
