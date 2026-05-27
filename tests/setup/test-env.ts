import {
  createAdminDatabaseUrl,
  createDatabaseUrl,
  getWorkerDbName,
  normalizeWorkerId,
  readTestDbRuntimeState,
  recreateWorkerDatabaseFromTemplate,
  shouldLogTestDbDebug,
  workerDatabaseExists,
} from './db-provisioning';
import { resetServiceRoleClientForTests } from '@supabase/service-role';

await setupWorkerDatabaseEnv();

// Google OAuth defaults for tests – only used when not set from outside
if (!process.env.GOOGLE_CLIENT_ID) {
  process.env.GOOGLE_CLIENT_ID = 'test_google_client_id';
}
if (!process.env.GOOGLE_CLIENT_SECRET) {
  process.env.GOOGLE_CLIENT_SECRET = 'test_google_client_secret';
}
if (!process.env.GOOGLE_REDIRECT_URI) {
  process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/oauth/callback';
}

// OAuth encryption default for tests
if (!process.env.OAUTH_ENCRYPTION_KEY) {
  process.env.OAUTH_ENCRYPTION_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
}

// Avoid fire-and-forget inline regeneration drains racing DB-backed tests unless a spec opts in.
if (process.env.REGENERATION_INLINE_PROCESSING === undefined) {
  process.env.REGENERATION_INLINE_PROCESSING = 'false';
}

async function setupWorkerDatabaseEnv(): Promise<void> {
  const runtimeState = readTestDbRuntimeState();
  if (!runtimeState) {
    return;
  }

  const workerId = normalizeWorkerId(process.env.VITEST_POOL_ID);
  const workerDbName = getWorkerDbName(workerId);
  const adminConnectionUrl = createAdminDatabaseUrl(
    runtimeState.TEST_DB_CONTAINER_URL,
  );
  const workerConnectionUrl = createDatabaseUrl(
    runtimeState.TEST_DB_CONTAINER_URL,
    workerDbName,
  );

  const workerDbAlreadyExists = await workerDatabaseExists(
    adminConnectionUrl,
    workerDbName,
  );

  if (!workerDbAlreadyExists) {
    await recreateWorkerDatabaseFromTemplate({
      adminConnectionUrl,
      templateDbName: runtimeState.TEST_DB_TEMPLATE_DB_NAME,
      workerDbName,
    });
  }

  process.env.ALLOW_DB_TRUNCATE = runtimeState.ALLOW_DB_TRUNCATE;
  process.env.POSTGRES_URL = workerConnectionUrl;
  process.env.POSTGRES_URL_NON_POOLING = workerConnectionUrl;
  process.env.TEST_WORKER_DB_NAME = workerDbName;
  process.env.TEST_WORKER_ID = workerId;

  await resetServiceRoleClientForTests();

  if (shouldLogTestDbDebug()) {
    console.log(
      `[Test DB] worker ${workerId} -> ${workerDbName}${workerDbAlreadyExists ? ' (reused)' : ' (created)'}`,
    );
  }
}
