/**
 * Intentional readFileSync: privilege ordering must hold on the Supabase CLI
 * lexicographic path where harden re-grants DELETE after 0036 revokes it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(TEST_DIR, '../../../supabase/migrations');

type MigrationJournal = {
  entries: Array<{ tag: string }>;
};

describe('task_progress DELETE privilege ordering', () => {
  it('revokes DELETE in a migration after the harden grant', () => {
    const harden =
      '20260520194501_harden_authenticated_server_owned_writes.sql';
    const revoke = '20260520194502_revoke_task_progress_delete.sql';
    const migrationFiles = readdirSync(MIGRATIONS_DIR)
      .filter((name) => name.endsWith('.sql'))
      .toSorted();

    expect(migrationFiles.indexOf(harden)).toBeGreaterThanOrEqual(0);
    expect(migrationFiles.indexOf(revoke)).toBeGreaterThan(
      migrationFiles.indexOf(harden),
    );

    const hardenSql = readFileSync(resolve(MIGRATIONS_DIR, harden), 'utf8');
    const revokeSql = readFileSync(resolve(MIGRATIONS_DIR, revoke), 'utf8');

    expect(hardenSql).toMatch(
      /GRANT INSERT, UPDATE, DELETE ON "task_progress" TO authenticated;/,
    );
    expect(revokeSql).toMatch(
      /REVOKE DELETE ON TABLE "task_progress" FROM authenticated;/,
    );
  });

  it('registers the later revoke migration in the Drizzle journal', () => {
    const journal = JSON.parse(
      readFileSync(resolve(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'),
    ) as MigrationJournal;

    expect(
      journal.entries.some(
        (entry) => entry.tag === '20260520194502_revoke_task_progress_delete',
      ),
    ).toBe(true);
  });

  it('keeps test bootstrap aligned with insert/update-only task_progress', () => {
    const bootstrap = readFileSync(
      resolve(TEST_DIR, '../../helpers/db/bootstrap.ts'),
      'utf8',
    );
    const rlsBootstrap = readFileSync(
      resolve(TEST_DIR, '../../helpers/db/rls-bootstrap.ts'),
      'utf8',
    );

    for (const contents of [bootstrap, rlsBootstrap]) {
      expect(contents).toContain(
        'GRANT INSERT, UPDATE ON "task_progress" TO authenticated',
      );
      expect(contents).toContain(
        'REVOKE DELETE ON "task_progress" FROM authenticated',
      );
    }
  });
});
