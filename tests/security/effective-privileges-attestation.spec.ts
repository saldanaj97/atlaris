import { AUTHENTICATED_SERVER_OWNED_WRITE_TABLES } from '@supabase/privileges/authenticated-table-privileges';
import {
  USER_EMAIL_NOTIFICATION_PREFERENCES_AUTHENTICATED_INSERT_COLUMNS,
  USER_EMAIL_NOTIFICATION_PREFERENCES_AUTHENTICATED_UPDATE_COLUMNS,
  USER_EMAIL_NOTIFICATION_SETTINGS_AUTHENTICATED_INSERT_COLUMNS,
  USER_EMAIL_NOTIFICATION_SETTINGS_AUTHENTICATED_UPDATE_COLUMNS,
  USER_PREFERENCES_AUTHENTICATED_INSERT_COLUMNS,
  USER_PREFERENCES_AUTHENTICATED_UPDATE_COLUMNS,
} from '@supabase/privileges/user-preferences-authenticated-columns';
import { USERS_AUTHENTICATED_UPDATE_COLUMNS } from '@supabase/privileges/users-authenticated-update-columns';
import { db } from '@supabase/service-role';
import { sql } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const ATTESTATION_SQL = readFileSync(
  join(REPO_ROOT, 'scripts', 'db', 'attest-effective-privileges.sql'),
  'utf8',
);

function sqlArray(values: readonly string[]): string {
  return `ARRAY['${values.join("', '")}']`;
}

const ROLLBACK = Symbol('rollback effective privileges test transaction');

async function runInRolledBackTransaction(
  callback: (tx: Pick<typeof db, 'execute'>) => Promise<void>,
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await callback(tx);
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

describe('effective database privilege attestation', () => {
  it('uses the canonical client privilege allowlists and passes the migrated database', async () => {
    expect(ATTESTATION_SQL).toContain(
      "ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']",
    );
    expect(ATTESTATION_SQL).toContain("policy.permissive = 'PERMISSIVE'");
    expect(ATTESTATION_SQL).toContain("IN ('public', 'anon')");
    expect(ATTESTATION_SQL).toContain(
      sqlArray(AUTHENTICATED_SERVER_OWNED_WRITE_TABLES),
    );
    expect(ATTESTATION_SQL).toContain(
      sqlArray(USERS_AUTHENTICATED_UPDATE_COLUMNS),
    );
    expect(ATTESTATION_SQL).toContain('authenticated has INSERT on public.%I');
    expect(ATTESTATION_SQL).toContain(
      "namespace.nspname IN ('public', 'private')",
    );
    expect(ATTESTATION_SQL).toContain(
      sqlArray(USER_PREFERENCES_AUTHENTICATED_INSERT_COLUMNS),
    );
    expect(ATTESTATION_SQL).toContain(
      sqlArray(USER_PREFERENCES_AUTHENTICATED_UPDATE_COLUMNS),
    );
    expect(ATTESTATION_SQL).toContain(
      sqlArray(USER_EMAIL_NOTIFICATION_SETTINGS_AUTHENTICATED_INSERT_COLUMNS),
    );
    expect(ATTESTATION_SQL).toContain(
      sqlArray(USER_EMAIL_NOTIFICATION_SETTINGS_AUTHENTICATED_UPDATE_COLUMNS),
    );
    expect(ATTESTATION_SQL).toContain(
      sqlArray(
        USER_EMAIL_NOTIFICATION_PREFERENCES_AUTHENTICATED_INSERT_COLUMNS,
      ),
    );
    expect(ATTESTATION_SQL).toContain(
      sqlArray(
        USER_EMAIL_NOTIFICATION_PREFERENCES_AUTHENTICATED_UPDATE_COLUMNS,
      ),
    );

    await expect(db.execute(sql.raw(ATTESTATION_SQL))).resolves.toBeDefined();
  });

  it('rejects a service-only column grant when table-level privileges are absent', async () => {
    await runInRolledBackTransaction(async (tx) => {
      await tx.execute(sql`
        REVOKE ALL ON TABLE "clerk_webhook_events" FROM authenticated;
        GRANT SELECT ("event_id") ON TABLE "clerk_webhook_events" TO authenticated;
      `);

      const tablePrivilegeRows = (await tx.execute(sql`
        SELECT has_table_privilege(
          'authenticated',
          'public.clerk_webhook_events',
          'SELECT'
        ) AS has_table_select
      `)) as Array<{ has_table_select: boolean }>;
      expect(tablePrivilegeRows[0]?.has_table_select).toBe(false);

      await expect(tx.execute(sql.raw(ATTESTATION_SQL))).rejects.toThrow(
        /authenticated has SELECT column privilege on service-only public\.clerk_webhook_events\./,
      );
    });
  });

  it('requires mandatory webhook and email ledgers while tolerating the optional archive absence', async () => {
    await runInRolledBackTransaction(async (tx) => {
      await tx.execute(sql`
        ALTER TABLE "email_notification_delivery_runs"
        RENAME TO "effective_privileges_attestation_missing_email_runs";
      `);

      await expect(tx.execute(sql.raw(ATTESTATION_SQL))).rejects.toThrow(
        /required service-only public\.email_notification_delivery_runs table is missing/,
      );
    });

    await runInRolledBackTransaction(async (tx) => {
      const archiveRows = (await tx.execute(sql`
        SELECT to_regclass('public.legacy_stripe_entitlement_archive') AS table_name
      `)) as Array<{ table_name: string | null }>;

      if (archiveRows[0]?.table_name !== null) {
        await tx.execute(sql`
          ALTER TABLE "legacy_stripe_entitlement_archive"
          RENAME TO "effective_privileges_attestation_missing_archive";
        `);
      }

      await expect(tx.execute(sql.raw(ATTESTATION_SQL))).resolves.toBeDefined();
    });
  });
});
