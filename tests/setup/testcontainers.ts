/**
 * Vitest globalSetup: spins up a PostgreSQL Testcontainer before any
 * integration / e2e / security tests and tears it down when they finish.
 *
 * The container:
 *   - Uses Postgres 17 (matching docker-compose.test.yml)
 *   - Creates a test database with extensions and RLS roles
 *   - Sets POSTGRES_URL / POSTGRES_URL_NON_POOLING so the service-role
 *     client and drizzle-kit connect to the ephemeral instance
 *   - Applies `supabase/migrations` via `pnpm db:migrate` (migration chain matches production)
 *
 * To skip Testcontainers (e.g. in CI where a sidecar DB already exists)
 * set SKIP_TESTCONTAINERS=true and provide POSTGRES_URL and/or
 * POSTGRES_URL_NON_POOLING. Bootstrap, migrations, grants, fixups,
 * template creation, and process-scoped runtime-state publication still run.
 */

import {
  getPostgresHostname,
  isLocalPostgresHostname,
} from '../../scripts/db/local-postgres-host';
import {
  buildTestDbRuntimeState,
  createAdminDatabaseUrl,
  createDatabaseUrl,
  ensureDatabaseExists,
  ensureTemplateDatabase,
  getBaseDbName,
  getTemplateDbName,
} from './db-provisioning';
import { resetServiceRoleClientForTests } from '@supabase/service-role';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  bootstrapDatabase,
  grantRlsPermissions,
} from '@tests/helpers/db/bootstrap';
import { applyRuntimeDatabaseFixups } from '@tests/helpers/db/runtime-fixups';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

let container: StartedPostgreSqlContainer | null = null;
const testDbPassword = randomUUID();
const testcontainersEnvFile =
  process.env.TESTCONTAINERS_ENV_FILE?.trim() ||
  join(
    __dirname,
    '..',
    `.testcontainers-env.${process.pid}.${randomUUID()}.json`,
  );

// Each Vitest process needs its own runtime-state file. A fixed shared path lets
// concurrent `pnpm vitest run` sessions overwrite each other's container metadata,
// so workers can start pointing at the wrong ephemeral Postgres instance.
process.env.TESTCONTAINERS_ENV_FILE = testcontainersEnvFile;

const DEFAULT_POSTGRES_WAIT_TIMEOUT_MS = 60_000;
const DEFAULT_POSTGRES_WAIT_INTERVAL_MS = 250;

type WaitForPostgresOptions = {
  timeoutMs?: number;
  intervalMs?: number;
};

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
      POSTGRES_URL: connectionUrl,
      POSTGRES_URL_NON_POOLING: connectionUrl,
      NODE_ENV: 'test',
    },
  });
}

export function resolveExternalPostgresUrl(): string {
  const nonPooling = process.env.POSTGRES_URL_NON_POOLING?.trim();
  const pooling = process.env.POSTGRES_URL?.trim();
  const connectionUrl = nonPooling || pooling;

  if (!connectionUrl) {
    throw new Error(
      'SKIP_TESTCONTAINERS=true requires POSTGRES_URL or POSTGRES_URL_NON_POOLING',
    );
  }

  for (const candidate of [nonPooling, pooling]) {
    if (!candidate) {
      continue;
    }

    const hostname = getPostgresHostname(candidate);
    if (!hostname || !isLocalPostgresHostname(hostname)) {
      throw new Error(
        `SKIP_TESTCONTAINERS=true refuses non-local PostgreSQL host "${hostname ?? candidate}"`,
      );
    }
  }

  return connectionUrl;
}

export async function waitForPostgres(
  connectionUrl: string,
  options: WaitForPostgresOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_POSTGRES_WAIT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_POSTGRES_WAIT_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    const sql = postgres(connectionUrl, { max: 1, connect_timeout: 2 });

    try {
      await sql`SELECT 1`;
      return;
    } catch (error) {
      lastError = error;
    } finally {
      await sql.end({ timeout: 1 }).catch(() => undefined);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  const detail =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`PostgreSQL not ready after ${timeoutMs}ms: ${detail}`);
}

async function provisionSharedTestDatabase(
  containerUrl: string,
): Promise<void> {
  const adminConnectionUrl = createAdminDatabaseUrl(containerUrl);
  const baseDbName = getBaseDbName();
  const templateDbName = getTemplateDbName();
  const baseConnectionUrl = createDatabaseUrl(containerUrl, baseDbName);

  console.log('[Testcontainers] Bootstrapping database…');

  await ensureDatabaseExists(adminConnectionUrl, baseDbName);

  process.env.POSTGRES_URL = baseConnectionUrl;
  process.env.POSTGRES_URL_NON_POOLING = baseConnectionUrl;
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
  writeFileSync(testcontainersEnvFile, JSON.stringify(runtimeState));

  console.log('[Testcontainers] Ready ✓');
}

export async function setup(): Promise<void> {
  if (process.env.SKIP_TESTCONTAINERS === 'true') {
    console.log(
      '[Testcontainers] Using external PostgreSQL — SKIP_TESTCONTAINERS=true',
    );
    const connectionUrl = resolveExternalPostgresUrl();
    await waitForPostgres(connectionUrl);
    await provisionSharedTestDatabase(connectionUrl);
    return;
  }

  console.log('[Testcontainers] Starting PostgreSQL 17 container…');

  container = await new PostgreSqlContainer('postgres:17-alpine')
    .withDatabase('atlaris_runtime')
    .withUsername('postgres')
    .withPassword(testDbPassword)
    .withExposedPorts(5432)
    .start();

  console.log('[Testcontainers] Container started, bootstrapping database…');

  await provisionSharedTestDatabase(container.getConnectionUri());
}

export async function teardown(): Promise<void> {
  // Clean up the temp env file
  try {
    unlinkSync(testcontainersEnvFile);
  } catch {
    // File may not exist if setup was skipped
  }

  Reflect.deleteProperty(process.env, 'TESTCONTAINERS_ENV_FILE');

  if (container) {
    console.log('[Testcontainers] Stopping container…');
    await container.stop();
    container = null;
    console.log('[Testcontainers] Stopped ✓');
  }
}
