import { readFileSync } from 'node:fs';
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

const migrationWorkflows = [
  {
    environment: 'staging',
    fileName: 'staging-db-migrations.yaml',
    protectedBranch: 'develop',
  },
  {
    environment: 'production',
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

    expect(script).toContain(
      '20260706221000_archive_legacy_stripe_entitlements.sql',
    );
    expect(script).toContain(
      '20260810120000_create_clerk_webhook_event_claims.sql',
    );
    expect(script).toContain(
      'supabase migration up --linked --include-all --yes',
    );
    expect(script).not.toContain('supabase migration repair');
    expect(script).not.toContain('db query --linked --file');
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
