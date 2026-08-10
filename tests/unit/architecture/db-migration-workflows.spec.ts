import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const WORKFLOWS_DIR = join(REPO_ROOT, '.github', 'workflows');
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations');
const PHASED_MIGRATION_SCRIPT = join(
  REPO_ROOT,
  'scripts',
  'db',
  'run-phased-migrations.sh',
);
const MIGRATION_JOURNAL = join(MIGRATIONS_DIR, 'meta', '_journal.json');
const EFFECTIVE_PRIVILEGES_ATTESTATION_SCRIPT = join(
  REPO_ROOT,
  'scripts',
  'db',
  'attest-effective-privileges.sh',
);

const migrationWorkflows = [
  {
    environment: 'staging',
    fileName: 'staging-db-migrations.yaml',
    protectedBranch: 'develop',
  },
  {
    environment: 'Production – atlaris',
    fileName: 'production-db-migrations.yaml',
    protectedBranch: 'main',
  },
];

function readWorkflow(fileName: string): string {
  return readFileSync(join(WORKFLOWS_DIR, fileName), 'utf8');
}

describe('Supabase migration workflows', () => {
  it.each(migrationWorkflows)(
    '$fileName keeps manual dispatch on the protected branch',
    ({ fileName, protectedBranch }) => {
      const workflow = readWorkflow(fileName);

      expect(workflow).toContain('workflow_dispatch:');
      expect(workflow).not.toContain('\n  push:');
      expect(workflow).toContain('phase:');
      expect(workflow).toContain(
        `if: github.ref == 'refs/heads/${protectedBranch}'`,
      );
    },
  );

  it.each(migrationWorkflows)(
    '$fileName uses the protected GitHub environment before Supabase secrets',
    ({ environment, fileName }) => {
      const workflow = readWorkflow(fileName);
      const environmentIndex = workflow.indexOf(`environment: ${environment}`);
      const secretsIndex = workflow.indexOf('\n    env:\n');

      expect(environmentIndex).toBeGreaterThan(-1);
      expect(secretsIndex).toBeGreaterThan(-1);
      expect(environmentIndex).toBeLessThan(secretsIndex);
    },
  );

  it.each(migrationWorkflows)(
    '$fileName checks out the protected branch explicitly',
    ({ fileName, protectedBranch }) => {
      const workflow = readWorkflow(fileName);

      expect(workflow).toContain('uses: actions/checkout@');
      expect(workflow).toContain(`with:\n          ref: ${protectedBranch}`);
    },
  );

  it.each(migrationWorkflows)(
    '$fileName separates expand migrations from confirmed contract migrations',
    ({ fileName }) => {
      const workflow = readWorkflow(fileName);

      expect(workflow).toContain('confirm_contract:');
      expect(workflow).toContain('MIGRATION_PHASE: ${{ inputs.phase }}');
      expect(workflow).toContain(
        'CONTRACT_CONFIRMATION: ${{ inputs.confirm_contract }}',
      );
      expect(workflow).toContain('bash scripts/db/run-phased-migrations.sh');
    },
  );

  it('applies each expand migration and its history record atomically', () => {
    const script = readFileSync(PHASED_MIGRATION_SCRIPT, 'utf8');
    const expandMigrations = script.match(
      /readonly -a EXPAND_MIGRATIONS=\(([\s\S]*?)\n\)/,
    )?.[1];

    expect(expandMigrations).toBeDefined();
    expect(expandMigrations).not.toContain(
      '20260811100400_revoke_users_authenticated_insert.sql',
    );

    expect(script).toContain(
      '20260706221000_archive_legacy_stripe_entitlements.sql',
    );
    expect(script).toContain(
      '20260810120000_create_clerk_webhook_event_claims.sql',
    );
    expect(script).toContain(
      '20260811100100_add_clerk_user_identity_projection.sql',
    );
    expect(script).toContain(
      '20260811100200_enforce_resolved_email_delivery_payload_minimization.sql',
    );
    expect(script).toContain(
      '20260811100700_revoke_anon_unsafe_table_privileges.sql',
    );
    expect(script).not.toContain(
      '20260811100000_clear_module_lesson_generation_errors.sql',
    );
    expect(script).toContain(
      'supabase migration up --linked --include-all --yes',
    );
    expect(script).not.toContain('supabase migration repair');
    expect(script).not.toContain('db query --linked --file');
  });

  it('revokes unsafe anonymous table privileges for existing and future tables', () => {
    const migration = readFileSync(
      join(
        MIGRATIONS_DIR,
        '20260811100700_revoke_anon_unsafe_table_privileges.sql',
      ),
      'utf8',
    );

    expect(migration).toContain(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER\nON ALL TABLES IN SCHEMA public\nFROM PUBLIC, anon;',
    );
    expect(migration).toContain(
      'ALTER DEFAULT PRIVILEGES\n  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES\n  FROM PUBLIC, anon;',
    );
    expect(migration).toContain(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public\n  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES\n  FROM PUBLIC, anon;',
    );
    expect(migration).not.toMatch(/REVOKE SELECT/i);
  });

  it('attests effective privileges after each successful migration phase', () => {
    const script = readFileSync(PHASED_MIGRATION_SCRIPT, 'utf8');
    const attestation = readFileSync(
      EFFECTIVE_PRIVILEGES_ATTESTATION_SCRIPT,
      'utf8',
    );

    expect(script).toMatch(
      /expand\)[\s\S]*apply_expand_migrations[\s\S]*attest_effective_privileges expand/,
    );
    expect(script).toMatch(
      /contract\)[\s\S]*apply_contract_migrations[\s\S]*attest_effective_privileges contract/,
    );
    expect(attestation).toContain('supabase db query --linked');
    expect(attestation).toContain('--file "$ATTESTATION_SQL_FILE"');
    expect(attestation).toContain("ATTESTATION_PHASE='contract'");
    expect(attestation).toContain('expand|contract)');
    expect(attestation).toContain(
      "set_config('app.atlaris_migration_phase', '%s', false)",
    );
    expect(
      readFileSync(
        join(REPO_ROOT, 'scripts', 'db', 'attest-effective-privileges.sql'),
        'utf8',
      ),
    ).toContain(
      "migration_phase IS NULL OR migration_phase NOT IN ('expand', 'contract')",
    );
  });

  it('keeps authenticated task-progress deletion revoked after the broad grant', () => {
    const broadGrantMigration =
      '20260520194501_harden_authenticated_server_owned_writes.sql';
    const revokeMigration = '20260804160000_revoke_task_progress_delete.sql';
    const dropPolicyMigration =
      '20260811100600_drop_task_progress_delete_policy.sql';
    const broadGrant = readFileSync(
      join(MIGRATIONS_DIR, broadGrantMigration),
      'utf8',
    );
    const revoke = readFileSync(join(MIGRATIONS_DIR, revokeMigration), 'utf8');
    const dropPolicy = readFileSync(
      join(MIGRATIONS_DIR, dropPolicyMigration),
      'utf8',
    );

    expect(broadGrant).toContain(
      'GRANT INSERT, UPDATE, DELETE ON "task_progress" TO authenticated',
    );
    expect(revokeMigration > broadGrantMigration).toBe(true);
    expect(revoke).toContain(
      'REVOKE DELETE ON "task_progress" FROM authenticated',
    );
    expect(dropPolicyMigration > revokeMigration).toBe(true);
    expect(dropPolicy).toContain(
      'DROP POLICY IF EXISTS "task_progress_delete_own" ON "task_progress"',
    );

    const laterMigrationSql = readdirSync(MIGRATIONS_DIR)
      .filter(
        (fileName) => fileName.endsWith('.sql') && fileName > revokeMigration,
      )
      .map((fileName) => readFileSync(join(MIGRATIONS_DIR, fileName), 'utf8'))
      .join('\n');
    expect(laterMigrationSql).not.toMatch(
      /GRANT\s+(?:[A-Z]+,\s*)*DELETE\s+ON\s+"task_progress"\s+TO\s+authenticated/i,
    );

    const script = readFileSync(PHASED_MIGRATION_SCRIPT, 'utf8');
    expect(script).toContain(revokeMigration);
    expect(script).toContain(dropPolicyMigration);
  });

  it('keeps published migration versions unique and maps the retained ledger identities', () => {
    const migrationFiles = readdirSync(MIGRATIONS_DIR).filter((fileName) =>
      fileName.endsWith('.sql'),
    );
    const numericPrefixes = migrationFiles.map(
      (fileName) => fileName.match(/^(\d+)_/)?.[1],
    );

    expect(numericPrefixes.every(Boolean)).toBe(true);
    expect(new Set(numericPrefixes).size).toBe(numericPrefixes.length);
    expect(migrationFiles).not.toContain(
      '20260811100400_drop_task_progress_delete_policy.sql',
    );
    for (const [version, expectedFileName] of Object.entries({
      '20260811100400': '20260811100400_revoke_users_authenticated_insert.sql',
      '20260811100500': '20260811100500_revoke_users_authenticated_insert.sql',
    })) {
      expect(
        migrationFiles.filter((fileName) => fileName.startsWith(`${version}_`)),
      ).toEqual([expectedFileName]);
    }

    const migrationSql = (fileName: string) =>
      readFileSync(join(MIGRATIONS_DIR, fileName), 'utf8');
    expect(
      migrationSql('20260811100400_revoke_users_authenticated_insert.sql'),
    ).toBe('REVOKE INSERT ON "users" FROM authenticated;\n');
    expect(
      migrationSql('20260811100500_revoke_users_authenticated_insert.sql'),
    ).toBe('REVOKE INSERT ON "users" FROM authenticated;\n');
    expect(
      migrationSql('20260811100600_drop_task_progress_delete_policy.sql'),
    ).toBe(
      'DROP POLICY IF EXISTS "task_progress_delete_own" ON "task_progress";\n',
    );

    const journal = JSON.parse(readFileSync(MIGRATION_JOURNAL, 'utf8')) as {
      entries: Array<{
        idx: number;
        version: string;
        when: number;
        tag: string;
        breakpoints: boolean;
      }>;
    };
    const targetEntries = journal.entries.filter((entry) =>
      entry.tag.startsWith('20260811100'),
    );
    expect(targetEntries.slice(-4)).toEqual([
      {
        idx: 51,
        version: '7',
        when: 1786442640000,
        tag: '20260811100400_revoke_users_authenticated_insert',
        breakpoints: true,
      },
      {
        idx: 52,
        version: '7',
        when: 1786442700000,
        tag: '20260811100500_revoke_users_authenticated_insert',
        breakpoints: true,
      },
      {
        idx: 53,
        version: '7',
        when: 1786442760000,
        tag: '20260811100600_drop_task_progress_delete_policy',
        breakpoints: true,
      },
      {
        idx: 54,
        version: '7',
        when: 1786442820000,
        tag: '20260811100700_revoke_anon_unsafe_table_privileges',
        breakpoints: true,
      },
    ]);
    for (const entry of targetEntries.slice(-4)) {
      expect(migrationFiles).toContain(`${entry.tag}.sql`);
    }

    const script = readFileSync(PHASED_MIGRATION_SCRIPT, 'utf8');
    const expandMigrations = script.match(
      /readonly -a EXPAND_MIGRATIONS=\(([\s\S]*?)\n\)/,
    )?.[1];
    expect(expandMigrations).toBeDefined();
    expect(expandMigrations).not.toContain(
      '20260811100400_revoke_users_authenticated_insert.sql',
    );
    expect(expandMigrations).not.toContain(
      '20260811100500_revoke_users_authenticated_insert.sql',
    );
    expect(expandMigrations).not.toContain(
      '20260811100400_drop_task_progress_delete_policy.sql',
    );
    const taskProgressRevokeIndex = expandMigrations?.indexOf(
      '20260804160000_revoke_task_progress_delete.sql',
    );
    const taskProgressDropIndex = expandMigrations?.indexOf(
      '20260811100600_drop_task_progress_delete_policy.sql',
    );
    expect(taskProgressRevokeIndex).toBeGreaterThanOrEqual(0);
    expect(taskProgressDropIndex).toBeGreaterThan(
      taskProgressRevokeIndex ?? -1,
    );
    expect(script).toContain(
      '# Keep the users INSERT revoke contract-only until service-role provisioning is live.',
    );
    expect(script).toContain('supabase db push --include-all');
  });

  it('repairs claim retention after out-of-order contract migrations', () => {
    const repairMigration = readFileSync(
      join(
        MIGRATIONS_DIR,
        '20260810120100_restore_clerk_webhook_claim_retention.sql',
      ),
      'utf8',
    );

    expect(repairMigration).toContain(
      'expired_clerk_webhook_event_claims integer',
    );
    expect(repairMigration).toContain(
      'DELETE FROM "clerk_webhook_event_claims"',
    );

    const script = readFileSync(PHASED_MIGRATION_SCRIPT, 'utf8');
    expect(script).toContain(
      'contract-only cleanup repair after any out-of-order legacy',
    );
    expect(script).not.toContain(
      '20260810120100_restore_clerk_webhook_claim_retention.sql',
    );
  });

  it('archives Stripe and Clerk join keys before the legacy drop', () => {
    const migration = readFileSync(
      join(
        MIGRATIONS_DIR,
        '20260706221000_archive_legacy_stripe_entitlements.sql',
      ),
      'utf8',
    );

    expect(migration).toContain('"user_id" uuid PRIMARY KEY');
    expect(migration).toContain('"auth_user_id" text NOT NULL');
    expect(migration).toContain('"stripe_customer_id" text');
    expect(migration).toContain('"stripe_subscription_id" text');
    expect(migration).toContain(
      'REVOKE ALL ON TABLE "legacy_stripe_entitlement_archive" FROM anon, authenticated',
    );
    expect(migration).toContain(
      'Cannot archive legacy Stripe entitlements after their source columns were dropped',
    );

    const script = readFileSync(PHASED_MIGRATION_SCRIPT, 'utf8');
    expect(script).toContain('20260706222017');
    expect(script).toContain('20260706221000');
    expect(script).toContain('Restore a pre-drop backup');
  });
});
