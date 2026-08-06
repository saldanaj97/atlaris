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
});
