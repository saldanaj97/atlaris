/**
 * Ephemeral Postgres 17 for local smoke — mirrors Vitest Testcontainers setup
 * without writing state into the repo.
 */
import { randomUUID } from 'node:crypto';

import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

const TEST_DB_PASSWORD = randomUUID();

export async function startSmokePostgresContainer(): Promise<StartedPostgreSqlContainer> {
  console.log('[smoke] Starting PostgreSQL 17 container…');

  const container = await new PostgreSqlContainer('postgres:17-alpine')
    .withDatabase('atlaris_test')
    .withUsername('postgres')
    .withPassword(TEST_DB_PASSWORD)
    .withExposedPorts(5432)
    .start();

  return container;
}

export async function stopSmokePostgresContainer(
  container: StartedPostgreSqlContainer | null
): Promise<void> {
  if (!container) {
    return;
  }
  console.log('[smoke] Stopping PostgreSQL container…');
  await container.stop();
  console.log('[smoke] PostgreSQL container stopped ✓');
}
