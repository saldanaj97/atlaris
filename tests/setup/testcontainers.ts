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
import { join } from 'node:path';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

import {
  bootstrapDatabase,
  grantRlsPermissions,
} from '@tests/helpers/db/bootstrap';

let container: StartedPostgreSqlContainer | null = null;
const testDbPassword = randomUUID();

/**
 * Path to the temp file used to pass the container connection URL
 * from globalSetup (main process) to test workers.
 */
const TC_ENV_FILE = join(__dirname, '..', '.testcontainers-env.json');

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
    .withDatabase('atlaris_test')
    .withUsername('postgres')
    .withPassword(testDbPassword)
    .withExposedPorts(5432)
    .start();

  const connectionUrl = container.getConnectionUri();

  console.log('[Testcontainers] Container started, bootstrapping database…');

  await bootstrapDatabase(connectionUrl);

  console.log('[Testcontainers] Applying migrations via pnpm db:migrate…');

  applySchema(connectionUrl);

  console.log('[Testcontainers] Granting RLS permissions…');

  await grantRlsPermissions(connectionUrl);

  // Expose connection URL to all test workers via env vars.
  // Vitest globalSetup env mutations are inherited by worker processes.
  process.env.DATABASE_URL = connectionUrl;
  process.env.DATABASE_URL_NON_POOLING = connectionUrl;
  process.env.DATABASE_URL_UNPOOLED = connectionUrl;
  process.env.ALLOW_DB_TRUNCATE = 'true';

  // Write env to a temp file for cross-process propagation.
  // setupFiles (test-env.ts) can read this when process.env wasn't inherited.
  writeFileSync(
    TC_ENV_FILE,
    JSON.stringify({
      DATABASE_URL: connectionUrl,
      DATABASE_URL_NON_POOLING: connectionUrl,
      DATABASE_URL_UNPOOLED: connectionUrl,
      ALLOW_DB_TRUNCATE: 'true',
    })
  );

  console.log('[Testcontainers] Ready ✓');
}

export async function teardown(): Promise<void> {
  // Clean up the temp env file
  try {
    unlinkSync(TC_ENV_FILE);
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
