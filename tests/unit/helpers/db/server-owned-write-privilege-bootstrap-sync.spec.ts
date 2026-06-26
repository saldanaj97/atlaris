import { serverOwnedWriteTables } from '../../../security/rls-test-helpers';
import { AUTHENTICATED_SERVER_OWNED_WRITE_TABLES } from '@supabase/privileges/authenticated-table-privileges';
/**
 * Intentional readFileSync: ensure bootstrap, RLS bootstrap, migration, and
 * security helpers all reference the same server-owned write revoke list.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, '../../../../');

describe('server-owned write privilege bootstrap sync', () => {
  it('security helpers re-export AUTHENTICATED_SERVER_OWNED_WRITE_TABLES', () => {
    expect([...serverOwnedWriteTables]).toEqual([
      ...AUTHENTICATED_SERVER_OWNED_WRITE_TABLES,
    ]);
  });

  it('migration, bootstrap, and rls-bootstrap revoke every server-owned table', () => {
    const migration = readFileSync(
      resolve(
        REPO_ROOT,
        'supabase/migrations/20260520194501_harden_authenticated_server_owned_writes.sql',
      ),
      'utf8',
    );
    const learningActivityMigration = readFileSync(
      resolve(
        REPO_ROOT,
        'supabase/migrations/0036_add_learning_activity_events.sql',
      ),
      'utf8',
    );
    const serverOwnedMigrationSql = `${migration}\n${learningActivityMigration}`;
    const bootstrap = readFileSync(
      resolve(TEST_DIR, '../../../helpers/db/bootstrap.ts'),
      'utf8',
    );
    const rlsBootstrap = readFileSync(
      resolve(TEST_DIR, '../../../helpers/db/rls-bootstrap.ts'),
      'utf8',
    );

    const migrationRevokeBlock =
      /REVOKE INSERT, UPDATE, DELETE ON[\s\S]+FROM authenticated;/;
    expect(migration).toMatch(migrationRevokeBlock);

    for (const table of AUTHENTICATED_SERVER_OWNED_WRITE_TABLES) {
      expect(serverOwnedMigrationSql).toContain(`"${table}"`);
    }

    expect(bootstrap).toContain('AUTHENTICATED_SERVER_OWNED_WRITE_TABLES');
    expect(bootstrap).toMatch(
      /REVOKE INSERT, UPDATE, DELETE ON \$\{serverOwnedTablesSql\} FROM authenticated/,
    );
    expect(rlsBootstrap).toContain(
      'AUTHENTICATED_SERVER_OWNED_WRITE_TABLES_SQL',
    );
    expect(rlsBootstrap).toMatch(
      /REVOKE INSERT, UPDATE, DELETE ON[\s\S]*AUTHENTICATED_SERVER_OWNED_WRITE_TABLES_SQL[\s\S]*FROM authenticated/,
    );
  });
});
