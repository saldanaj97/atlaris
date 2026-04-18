/**
 * Vitest globalSetup: spins up a PostgreSQL Testcontainer before any
 * integration / e2e / security tests and tears it down when they finish.
 *
 * The container:
 *   - Uses Postgres 17 (matching docker-compose.test.yml)
 *   - Creates a test database with extensions and RLS roles
 *   - Sets DATABASE_URL / DATABASE_URL_NON_POOLING so the service-role
 *     client and drizzle-kit connect to the ephemeral instance
 *   - Applies the schema via `pnpm db:migrate` (migration chain matches production)
 *
 * To skip Testcontainers (e.g. in CI where a sidecar DB already exists)
 * set SKIP_TESTCONTAINERS=true.
 */

import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { unlinkSync, writeFileSync } from 'node:fs';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

import {
  bootstrapDatabase,
  grantRlsPermissions,
} from '@tests/helpers/db/bootstrap';
import { applyRuntimeDatabaseFixups } from '@tests/helpers/db/runtime-fixups';
import { resetServiceRoleClientForTests } from '@/lib/db/service-role';

import {
  buildTestDbRuntimeState,
  createAdminDatabaseUrl,
  createDatabaseUrl,
  ensureDatabaseExists,
  ensureTemplateDatabase,
  getBaseDbName,
  getTemplateDbName,
  TESTCONTAINERS_ENV_FILE,
} from './db-provisioning';

let container: StartedPostgreSqlContainer | null = null;
const testDbPassword = randomUUID();

/**
 * Apply migrations so DB policy SQL matches the migration chain (e.g. ALTER POLICY
 * updates after column renames). `drizzle-kit push` alone can leave policy drift
 * relative to `pnpm db:migrate` / production.
 */
function applySchema(connectionUrl: string): void {
  execSync('pnpm db:migrate', {
    stdio: 'pipe',
    env: {
      ...process.env,
      DATABASE_URL: connectionUrl,
      DATABASE_URL_NON_POOLING: connectionUrl,
      DATABASE_URL_UNPOOLED: connectionUrl,
      NODE_ENV: 'test',
    },
  });
}

export async function setup(): Promise<void> {
  if (process.env.SKIP_TESTCONTAINERS === 'true') {
    console.log('[Testcontainers] Skipped — SKIP_TESTCONTAINERS=true');
    return;
  }

  console.log('[Testcontainers] Starting PostgreSQL 17 container…');

  container = await new PostgreSqlContainer('postgres:17-alpine')
    .withDatabase('atlaris_runtime')
    .withUsername('postgres')
    .withPassword(testDbPassword)
    .withExposedPorts(5432)
    .start();

  const containerUrl = container.getConnectionUri();
  const adminConnectionUrl = createAdminDatabaseUrl(containerUrl);
  const baseDbName = getBaseDbName();
  const templateDbName = getTemplateDbName();
  const baseConnectionUrl = createDatabaseUrl(containerUrl, baseDbName);

  console.log('[Testcontainers] Container started, bootstrapping database…');

  await ensureDatabaseExists(adminConnectionUrl, baseDbName);

  process.env.DATABASE_URL = baseConnectionUrl;
  process.env.DATABASE_URL_NON_POOLING = baseConnectionUrl;
  process.env.DATABASE_URL_UNPOOLED = baseConnectionUrl;
  process.env.ALLOW_DB_TRUNCATE = 'true';

  await bootstrapDatabase(baseConnectionUrl);

  console.log('[Testcontainers] Applying migrations via pnpm db:migrate…');

  applySchema(baseConnectionUrl);

  console.log('[Testcontainers] Granting RLS permissions…');

  await grantRlsPermissions(baseConnectionUrl);

  console.log('[Testcontainers] Applying one-time test DB fixups…');

  await applyRuntimeDatabaseFixups();
  await resetServiceRoleClientForTests();

  console.log('[Testcontainers] Creating template database…');

  await ensureTemplateDatabase({
    adminConnectionUrl,
    baseDbName,
    templateDbName,
  });

  // setupFiles (test-env.ts) read this metadata and derive worker-specific URLs.
  const runtimeState = buildTestDbRuntimeState(containerUrl);
  writeFileSync(TESTCONTAINERS_ENV_FILE, JSON.stringify(runtimeState));

  console.log('[Testcontainers] Ready ✓');
}

export async function teardown(): Promise<void> {
  // Clean up the temp env file
  try {
    unlinkSync(TESTCONTAINERS_ENV_FILE);
  } catch {
    // File may not exist if setup was skipped
  }

  if (container) {
    console.log('[Testcontainers] Stopping container…');
    await container.stop();
    container = null;
    console.log('[Testcontainers] Stopped ✓');
  }
}
