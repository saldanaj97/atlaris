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
});
