/**
 * Bootstrap, migrate, grant, and seed the disposable smoke database.
 * Uses `NODE_ENV=test` only inside the migration subprocess (matches Vitest Testcontainers).
 */
import { execSync } from 'node:child_process';

import {
  bootstrapDatabase,
  grantRlsPermissions,
} from '@tests/helpers/db/bootstrap';
import { seedLocalProductTestingUser } from '@tests/helpers/db/seed-local-product-testing';

export function applySmokeMigrations(connectionUrl: string): void {
  execSync('pnpm db:migrate', {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: connectionUrl,
      DATABASE_URL_NON_POOLING: connectionUrl,
      DATABASE_URL_UNPOOLED: connectionUrl,
      NODE_ENV: 'test',
    },
  });
}

export async function prepareSmokeDatabase(
  connectionUrl: string
): Promise<void> {
  console.log('[smoke] Bootstrapping database roles and extensions…');
  await bootstrapDatabase(connectionUrl);

  console.log('[smoke] Applying migrations (pnpm db:migrate)…');
  applySmokeMigrations(connectionUrl);

  console.log('[smoke] Granting RLS permissions…');
  await grantRlsPermissions(connectionUrl);

  console.log('[smoke] Seeding local product-testing user…');
  await seedLocalProductTestingUser(connectionUrl);
}
