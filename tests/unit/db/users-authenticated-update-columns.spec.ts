/**
 * Intentional readFileSync: compares on-disk migration, workflows, and bootstrap
 * sources to the canonical allowlist so privilege drift fails in CI.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { USERS_AUTHENTICATED_UPDATE_COLUMNS } from '@/lib/db/privileges/users-authenticated-update-columns';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

function normalizeColumns(rawColumns: string): string[] {
  return rawColumns
    .split(',')
    .map((column) => column.trim())
    .filter(Boolean)
    .sort();
}

function extractUsersUpdateGrantColumns(fileContents: string): string[][] {
  return [
    ...fileContents.matchAll(
      /GRANT UPDATE \(([^)]+)\) ON "users" TO authenticated;/g
    ),
  ].map((match) => normalizeColumns(match[1] ?? ''));
}

describe('authenticated users UPDATE allowlist sync', () => {
  const expectedColumns = [...USERS_AUTHENTICATED_UPDATE_COLUMNS].sort();

  it('keeps migration 0018 in sync with the canonical allowlist', () => {
    const migrationContents = readFileSync(
      resolve(
        TEST_DIR,
        '../../../src/lib/db/migrations/0018_harden_users_update_columns.sql'
      ),
      'utf8'
    );

    const migrationMatches = extractUsersUpdateGrantColumns(migrationContents);

    expect(migrationMatches).toHaveLength(1);
    expect(migrationMatches[0]).toEqual(expectedColumns);
  });

  it('keeps ci-trunk grant blocks in sync with the canonical allowlist', () => {
    const workflowContents = readFileSync(
      resolve(TEST_DIR, '../../../.github/workflows/ci-trunk.yml'),
      'utf8'
    );

    const workflowMatches = extractUsersUpdateGrantColumns(workflowContents);

    expect(workflowMatches).toHaveLength(2);
    expect(workflowMatches).toEqual([expectedColumns, expectedColumns]);
  });

  it('keeps shared Postgres bootstrap using the canonical column list for users UPDATE', () => {
    const contents = readFileSync(
      resolve(TEST_DIR, '../../helpers/db/bootstrap.ts'),
      'utf8'
    );

    expect(contents).toMatch(
      /GRANT UPDATE \(\$\{USERS_AUTHENTICATED_UPDATE_COLUMNS\.join\(', '\)\}\) ON "users" TO authenticated/
    );
  });

  it('keeps rls-bootstrap using canonical privileges for users UPDATE', () => {
    const contents = readFileSync(
      resolve(TEST_DIR, '../../helpers/db/rls-bootstrap.ts'),
      'utf8'
    );

    expect(contents).toContain('USERS_AUTHENTICATED_UPDATE_COLUMNS_SQL');
    expect(contents).toContain(
      'sql.raw(USERS_AUTHENTICATED_UPDATE_COLUMNS_SQL)'
    );
  });

  it('installs auth.jwt from the shared bootstrap module and rls-bootstrap', () => {
    const sharedBootstrap = readFileSync(
      resolve(TEST_DIR, '../../helpers/db/bootstrap.ts'),
      'utf8'
    );
    const testcontainers = readFileSync(
      resolve(TEST_DIR, '../../setup/testcontainers.ts'),
      'utf8'
    );
    const rlsBootstrap = readFileSync(
      resolve(TEST_DIR, '../../helpers/db/rls-bootstrap.ts'),
      'utf8'
    );

    expect(sharedBootstrap).toContain("from '../sql/auth-jwt-bootstrap'");
    expect(sharedBootstrap).toContain('AUTH_JWT_BOOTSTRAP_SQL');
    expect(testcontainers).toContain("from '@tests/helpers/db/bootstrap'");
    expect(rlsBootstrap).toContain("from '../sql/auth-jwt-bootstrap'");
    expect(rlsBootstrap).toContain('AUTH_JWT_BOOTSTRAP_SQL');
    expect(rlsBootstrap).toContain('sql.raw(AUTH_JWT_BOOTSTRAP_SQL)');
  });
});
