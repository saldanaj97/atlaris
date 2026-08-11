import { AUTHENTICATED_SERVER_OWNED_WRITE_TABLES } from '@supabase/privileges/authenticated-table-privileges';
import { TASK_PROGRESS_AUTHENTICATED_UPDATE_COLUMNS } from '@supabase/privileges/task-progress-authenticated-update-columns';
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
const SECURITY_DEFINER_EXECUTE_REPAIR_SQL = readFileSync(
  join(
    REPO_ROOT,
    'supabase',
    'migrations',
    '20260811100800_revoke_security_definer_execute.sql',
  ),
  'utf8',
);

function attestationSql(phase: 'expand' | 'contract' = 'contract'): string {
  return `SELECT set_config('app.atlaris_migration_phase', '${phase}', true);\n${ATTESTATION_SQL}`;
}

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
    expect(ATTESTATION_SQL).toContain(
      sqlArray(TASK_PROGRESS_AUTHENTICATED_UPDATE_COLUMNS),
    );
    expect(ATTESTATION_SQL).toContain('authenticated has INSERT on public.%I');
    expect(ATTESTATION_SQL).toContain(
      "has_column_privilege(\n      'authenticated',\n      class.oid,\n      attribute.attnum,\n      'INSERT'",
    );
    expect(ATTESTATION_SQL).toContain('ORDER BY attribute.attnum\n  LIMIT 1;');
    expect(ATTESTATION_SQL).toContain(
      "namespace.nspname IN ('public', 'private')",
    );
    expect(ATTESTATION_SQL).toContain(
      'default_acl.defaclrole = current_user::regrole',
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

    await expect(db.execute(sql.raw(attestationSql()))).resolves.toBeDefined();
  });

  it('rejects anon table privileges inherited from PUBLIC', async () => {
    await runInRolledBackTransaction(async (tx) => {
      await tx.execute(sql`
        GRANT TRUNCATE ON TABLE "modules" TO PUBLIC;
      `);

      await expect(tx.execute(sql.raw(attestationSql()))).rejects.toMatchObject(
        {
          cause: expect.objectContaining({
            message: expect.stringMatching(
              /anon has TRUNCATE on public\.modules/,
            ),
          }),
        },
      );
    });
  });

  it('repairs browser execution inherited by security-definer functions', async () => {
    await runInRolledBackTransaction(async (tx) => {
      await tx.execute(sql`
        GRANT EXECUTE ON FUNCTION private.cleanup_retained_db_rows(timestamptz)
        TO PUBLIC, anon, authenticated;
      `);

      await expect(tx.execute(sql.raw(attestationSql()))).rejects.toMatchObject(
        {
          cause: expect.objectContaining({
            message: expect.stringMatching(
              /can execute security-definer function private\.cleanup_retained_db_rows/,
            ),
          }),
        },
      );
    });

    await runInRolledBackTransaction(async (tx) => {
      await tx.execute(sql`
        GRANT EXECUTE ON FUNCTION private.cleanup_retained_db_rows(timestamptz)
        TO PUBLIC, anon, authenticated;
      `);
      await tx.execute(sql.raw(SECURITY_DEFINER_EXECUTE_REPAIR_SQL));

      const privilegeRows = (await tx.execute(sql`
        SELECT role_name,
          has_function_privilege(
            role_name,
            'private.cleanup_retained_db_rows(timestamptz)',
            'EXECUTE'
          ) AS can_execute
        FROM unnest(ARRAY['anon', 'authenticated']) AS role_name
      `)) as Array<{ role_name: string; can_execute: boolean }>;
      expect(privilegeRows).toEqual([
        { role_name: 'anon', can_execute: false },
        { role_name: 'authenticated', can_execute: false },
      ]);
      await expect(
        tx.execute(sql.raw(attestationSql())),
      ).resolves.toBeDefined();
    });
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

      await expect(tx.execute(sql.raw(attestationSql()))).rejects.toMatchObject(
        {
          cause: expect.objectContaining({
            message: expect.stringMatching(
              /authenticated has SELECT column privilege on service-only public\.clerk_webhook_events\./,
            ),
          }),
        },
      );
    });
  });

  it('requires mandatory webhook and email ledgers while tolerating the optional archive absence', async () => {
    await runInRolledBackTransaction(async (tx) => {
      await tx.execute(sql`
        ALTER TABLE "email_notification_delivery_runs"
        RENAME TO "effective_privileges_attestation_missing_email_runs";
      `);

      await expect(tx.execute(sql.raw(attestationSql()))).rejects.toMatchObject(
        {
          cause: expect.objectContaining({
            message: expect.stringMatching(
              /required service-only public\.email_notification_delivery_runs table is missing/,
            ),
          }),
        },
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

      await expect(
        tx.execute(sql.raw(attestationSql())),
      ).resolves.toBeDefined();
    });
  });

  it('allows the expand-only users INSERT grant but rejects it in contract', async () => {
    await runInRolledBackTransaction(async (tx) => {
      await tx.execute(sql`
        GRANT INSERT ON TABLE "users" TO authenticated;
      `);

      await expect(
        tx.execute(sql.raw(attestationSql('expand'))),
      ).resolves.toBeDefined();
      await expect(
        tx.execute(sql.raw(attestationSql('contract'))),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({
          message: expect.stringMatching(
            /authenticated has INSERT on public\.users/,
          ),
        }),
      });
    });
  });

  it('allows legacy users UPDATE columns only during expand', async () => {
    await runInRolledBackTransaction(async (tx) => {
      await tx.execute(sql`
        ALTER TABLE "users" ADD COLUMN "preferred_ai_model" text;
        ALTER TABLE "users" ADD COLUMN "analytics_timezone" text;
        REVOKE UPDATE ON TABLE "users" FROM authenticated;
        GRANT UPDATE ("name", "preferred_ai_model", "analytics_timezone", "updated_at") ON TABLE "users" TO authenticated;
      `);

      await expect(
        tx.execute(sql.raw(attestationSql('expand'))),
      ).resolves.toBeDefined();
      await expect(
        tx.execute(sql.raw(attestationSql('contract'))),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({
          message: expect.stringMatching(
            /authenticated has incorrect UPDATE column privilege on public\.users\.(preferred_ai_model|analytics_timezone)/,
          ),
        }),
      });
    });

    await runInRolledBackTransaction(async (tx) => {
      await tx.execute(sql`
        ALTER TABLE "users" ADD COLUMN "preferred_ai_model" text;
        ALTER TABLE "users" ADD COLUMN "analytics_timezone" text;
        REVOKE UPDATE ON TABLE "users" FROM authenticated;
        GRANT UPDATE ("name", "preferred_ai_model", "analytics_timezone", "updated_at", "auth_user_id") ON TABLE "users" TO authenticated;
      `);

      await expect(
        tx.execute(sql.raw(attestationSql('expand'))),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({
          message: expect.stringMatching(
            /authenticated has incorrect UPDATE column privilege on public\.users\.auth_user_id/,
          ),
        }),
      });
    });

    await runInRolledBackTransaction(async (tx) => {
      await tx.execute(sql`
        ALTER TABLE "users" ADD COLUMN "preferred_ai_model" text;
        ALTER TABLE "users" ADD COLUMN "analytics_timezone" text;
        GRANT UPDATE ON TABLE "users" TO authenticated;
      `);

      await expect(
        tx.execute(sql.raw(attestationSql('expand'))),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({
          message: expect.stringMatching(
            /authenticated has incorrect UPDATE column privilege on public\.users\./,
          ),
        }),
      });
    });
  });

  it('rejects a column-only users INSERT grant in every phase', async () => {
    for (const phase of ['expand', 'contract'] as const) {
      await runInRolledBackTransaction(async (tx) => {
        await tx.execute(sql`
          REVOKE INSERT ON TABLE "users" FROM authenticated;
          GRANT INSERT (auth_user_id) ON TABLE "users" TO authenticated;
        `);

        await expect(
          tx.execute(sql.raw(attestationSql(phase))),
        ).rejects.toMatchObject({
          cause: expect.objectContaining({
            message: expect.stringMatching(
              /authenticated has INSERT column privilege on public\.users\.auth_user_id/,
            ),
          }),
        });
      });
    }
  });

  it('rejects column-only writes on application and server-owned tables', async () => {
    await runInRolledBackTransaction(async (tx) => {
      await tx.execute(sql`
        REVOKE INSERT ON TABLE "learning_plans" FROM anon;
        GRANT INSERT (topic) ON TABLE "learning_plans" TO anon;
        REVOKE UPDATE ON TABLE "learning_plans" FROM authenticated;
        GRANT UPDATE (generation_status) ON TABLE "learning_plans" TO authenticated;
      `);

      await expect(tx.execute(sql.raw(attestationSql()))).rejects.toMatchObject(
        {
          cause: expect.objectContaining({
            message: expect.stringMatching(
              /anon has INSERT column privilege on public\.learning_plans\./,
            ),
          }),
        },
      );
    });

    await runInRolledBackTransaction(async (tx) => {
      await tx.execute(sql`
        REVOKE UPDATE ON TABLE "learning_plans" FROM authenticated;
        GRANT UPDATE (generation_status) ON TABLE "learning_plans" TO authenticated;
      `);

      await expect(tx.execute(sql.raw(attestationSql()))).rejects.toMatchObject(
        {
          cause: expect.objectContaining({
            message: expect.stringMatching(
              /authenticated has UPDATE column privilege on server-owned public\.learning_plans\.generation_status/,
            ),
          }),
        },
      );
    });
  });
});
