import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const WORKFLOWS_DIR = join(REPO_ROOT, '.github', 'workflows');
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations');

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

      expect(workflow).toContain('Apply expand migrations');
      expect(workflow).toContain(
        '20260706221000_archive_legacy_stripe_entitlements.sql',
      );
      expect(workflow).toContain('confirm_contract:');
      expect(workflow).toContain('post-deploy-health-verified');
      expect(workflow).toContain('supabase db push --include-all');
    },
  );

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
  });
});
