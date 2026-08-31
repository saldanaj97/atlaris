import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

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
const VERCEL_DEPLOY_WORKFLOW = readFileSync(
  join(WORKFLOWS_DIR, 'vercel-deploy.yml'),
  'utf8',
);

const migrationWorkflows = [
  {
    checkoutRef: '${{ github.sha }}',
    environment: 'staging',
    fileName: 'staging-db-migrations.yaml',
    protectedBranch: 'develop',
  },
  {
    checkoutRef: '${{ github.sha }}',
    environment: 'Production – atlaris',
    fileName: 'production-db-migrations.yaml',
    protectedBranch: 'main',
  },
];

function readWorkflow(fileName: string): string {
  return readFileSync(join(WORKFLOWS_DIR, fileName), 'utf8');
}

function parseReadonlyBashArray(script: string, name: string): string[] {
  const match = script.match(
    new RegExp(`readonly -a ${name}=\\(([\\s\\S]*?)\\n\\)`),
  );
  if (!match?.[1]) {
    throw new Error(`Missing ${name} array`);
  }

  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

describe('Supabase migration workflows', () => {
  it.each(migrationWorkflows)(
    '$fileName keeps manual dispatch on the protected branch',
    ({ fileName, protectedBranch }) => {
      const workflow = readWorkflow(fileName);
      const [validateJob, deployJob] = workflow.split('\n  deploy:');

      expect(workflow).toContain('workflow_dispatch:');
      expect(workflow).not.toContain('\n  push:');
      expect(workflow).toContain('phase:');
      expect(validateJob).toContain('validate-dispatch:');
      expect(validateJob).not.toContain('environment:');
      expect(validateJob).toContain(
        `EXPECTED_REF: refs/heads/${protectedBranch}`,
      );
      expect(validateJob).toContain('exit 1');
      expect(deployJob).toContain('needs: validate-dispatch');
      expect(deployJob).toContain('timeout-minutes: 45');
      expect(deployJob).not.toContain(
        `if: github.ref == 'refs/heads/${protectedBranch}'`,
      );
    },
  );

  it.each(migrationWorkflows)(
    '$fileName scopes Supabase secrets behind the protected GitHub environment',
    ({ environment, fileName }) => {
      const workflow = readWorkflow(fileName);
      const environmentIndex = workflow.indexOf(`environment: ${environment}`);
      const stepsIndex = workflow.indexOf('\n    steps:\n');
      const secretsIndex = workflow.indexOf('secrets.SUPABASE_ACCESS_TOKEN');

      expect(environmentIndex).toBeGreaterThan(-1);
      expect(stepsIndex).toBeGreaterThan(-1);
      expect(secretsIndex).toBeGreaterThan(-1);
      expect(environmentIndex).toBeLessThan(secretsIndex);
      expect(workflow.slice(0, stepsIndex)).not.toContain('secrets.');
    },
  );

  it.each(migrationWorkflows)(
    '$fileName checks out its trusted candidate explicitly',
    ({ checkoutRef, fileName }) => {
      const workflow = readWorkflow(fileName);

      expect(workflow).toContain('uses: actions/checkout@');
      expect(workflow).toContain(`with:\n          ref: ${checkoutRef}`);
      expect(workflow).toContain('persist-credentials: false');
    },
  );

  it('records the Staging migration phase and exact dispatch SHA', () => {
    const workflow = readWorkflow('staging-db-migrations.yaml');

    expect(workflow).toContain(
      'run-name: Staging migrations (${{ inputs.phase }}) @ ${{ github.sha }}',
    );
  });

  it('retains Production expand proof across later candidates', () => {
    const workflow = readWorkflow('production-db-migrations.yaml');
    const production = VERCEL_DEPLOY_WORKFLOW.split(
      '\n  production-candidate:\n',
    )[1];

    expect(workflow).toContain(
      'run-name: Production migrations (${{ inputs.phase }}) @ ${{ github.sha }}',
    );
    expect(production).toBeDefined();
    expect(production).toContain(
      '- name: Verify a successful Production expand covers the candidate',
    );
    expect(production).toContain('gh api --paginate --slurp');
    expect(production).toContain(
      'actions/workflows/production-db-migrations.yaml/runs',
    );
    expect(production).toContain(
      '.display_title == ("Production migrations (expand) @ " + .head_sha)',
    );
    expect(production).toContain(
      'git merge-base --is-ancestor "${expand_sha}" "${EXPECTED_SHA}"',
    );
    expect(production).toContain(
      'candidate_changes="$(git diff --no-renames --name-only "${expand_sha}..${EXPECTED_SHA}")"',
    );
    expect(production).toContain(
      'grep -q \'^supabase/migrations/\' <<<"${candidate_changes}"',
    );
    expect(production).not.toMatch(/git diff[^\n]*\|\s*\n\s*grep -q/u);
    expect(production).toContain(
      'No successful Production expand run covers ${EXPECTED_SHA}.',
    );
    expect(VERCEL_DEPLOY_WORKFLOW).not.toContain('production_expand_required');
  });

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
    expect(script).toContain(
      '20260811100800_revoke_security_definer_execute.sql',
    );
    expect(script).toContain(
      '20260811100900_restrict_task_progress_update_columns.sql',
    );
    expect(script).toContain('20260825151604_add_user_entitlement_fields.sql');
    expect(script).toContain(
      '20260825153019_add_generation_attempt_purpose.sql',
    );
    expect(script).toContain(
      '20260826184123_expand_user_preferences_model_text_slots.sql',
    );
    expect(expandMigrations).not.toContain(
      '20260811100000_clear_module_lesson_generation_errors.sql',
    );
    expect(script).toContain(
      'supabase migration up --linked --include-all --yes --workdir',
    );
    expect(script).not.toContain('supabase db push');
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

  it('revokes browser execution of security-definer functions only', () => {
    const migration = readFileSync(
      join(
        MIGRATIONS_DIR,
        '20260811100800_revoke_security_definer_execute.sql',
      ),
      'utf8',
    );

    expect(migration).toContain('procedure.prosecdef');
    expect(migration).toContain("namespace.nspname IN ('public', 'private')");
    expect(migration).toContain(
      "'REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC, anon, authenticated'",
    );
    expect(migration).toContain(
      'ALTER DEFAULT PRIVILEGES FOR ROLE postgres\n  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;',
    );
    expect(migration).toContain(
      'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public\n  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;',
    );
    expect(migration).not.toMatch(/ON ALL FUNCTIONS/i);
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

  it('restricts authenticated task-progress updates to mutable progress fields', () => {
    const migrationName =
      '20260811100900_restrict_task_progress_update_columns.sql';
    const migration = readFileSync(join(MIGRATIONS_DIR, migrationName), 'utf8');

    expect(migration).toContain(
      'REVOKE UPDATE ON TABLE "task_progress" FROM authenticated;',
    );
    expect(migration).toContain(
      'GRANT UPDATE ("status", "completed_at", "updated_at") ON TABLE "task_progress" TO authenticated;',
    );
    expect(readFileSync(PHASED_MIGRATION_SCRIPT, 'utf8')).toContain(
      migrationName,
    );
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
    expect(targetEntries.slice(-6)).toEqual([
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
      {
        idx: 55,
        version: '7',
        when: 1786442880000,
        tag: '20260811100800_revoke_security_definer_execute',
        breakpoints: true,
      },
      {
        idx: 56,
        version: '7',
        when: 1786442940000,
        tag: '20260811100900_restrict_task_progress_update_columns',
        breakpoints: true,
      },
    ]);
    for (const entry of targetEntries.slice(-6)) {
      expect(migrationFiles).toContain(`${entry.tag}.sql`);
    }
    expect(journal.entries.at(-1)).toMatchObject({
      idx: 60,
      tag: '20260828002855_add_clerk_billing_projection_watermark',
    });
    expect(migrationFiles).toContain(
      '20260825151604_add_user_entitlement_fields.sql',
    );
    expect(migrationFiles).toContain(
      '20260825153019_add_generation_attempt_purpose.sql',
    );
    expect(migrationFiles).toContain(
      '20260826184123_expand_user_preferences_model_text_slots.sql',
    );

    const script = readFileSync(PHASED_MIGRATION_SCRIPT, 'utf8');
    const expandMigrations = parseReadonlyBashArray(
      script,
      'EXPAND_MIGRATIONS',
    );
    const contractMigrations = parseReadonlyBashArray(
      script,
      'CONTRACT_MIGRATIONS',
    );
    expect(expandMigrations).toContain(
      'supabase/migrations/20260825151604_add_user_entitlement_fields.sql',
    );
    expect(expandMigrations).toContain(
      'supabase/migrations/20260825153019_add_generation_attempt_purpose.sql',
    );
    expect(expandMigrations).toContain(
      'supabase/migrations/20260826184123_expand_user_preferences_model_text_slots.sql',
    );
    expect(expandMigrations).toContain(
      'supabase/migrations/20260828002855_add_clerk_billing_projection_watermark.sql',
    );
    expect(expandMigrations).not.toContain(
      'supabase/migrations/20260811100400_revoke_users_authenticated_insert.sql',
    );
    expect(expandMigrations).not.toContain(
      'supabase/migrations/20260811100500_revoke_users_authenticated_insert.sql',
    );
    expect(expandMigrations).not.toContain(
      'supabase/migrations/20260811100400_drop_task_progress_delete_policy.sql',
    );
    expect(contractMigrations).toContain(
      'supabase/migrations/20260811100400_revoke_users_authenticated_insert.sql',
    );
    expect(contractMigrations).toContain(
      'supabase/migrations/20260811100500_revoke_users_authenticated_insert.sql',
    );
    expect(contractMigrations).toContain(
      'supabase/migrations/20260810120100_restore_clerk_webhook_claim_retention.sql',
    );
    expect(contractMigrations).toContain(
      'supabase/migrations/20260811100000_clear_module_lesson_generation_errors.sql',
    );
    const taskProgressRevokeIndex = expandMigrations.indexOf(
      'supabase/migrations/20260804160000_revoke_task_progress_delete.sql',
    );
    const taskProgressDropIndex = expandMigrations.indexOf(
      'supabase/migrations/20260811100600_drop_task_progress_delete_policy.sql',
    );
    expect(taskProgressRevokeIndex).toBeGreaterThanOrEqual(0);
    expect(taskProgressDropIndex).toBeGreaterThan(taskProgressRevokeIndex);
    expect(script).toContain(
      '# Keep the users INSERT revoke contract-only until service-role provisioning is live.',
    );
    expect(script).not.toContain('supabase db push');
    expect(script).toContain(
      'supabase migration up --linked --include-all --yes --workdir',
    );
  });

  it('classifies every local migration into exactly one phase', () => {
    const script = readFileSync(PHASED_MIGRATION_SCRIPT, 'utf8');
    const expandMigrations = parseReadonlyBashArray(
      script,
      'EXPAND_MIGRATIONS',
    );
    const contractMigrations = parseReadonlyBashArray(
      script,
      'CONTRACT_MIGRATIONS',
    );
    const classified = [...expandMigrations, ...contractMigrations];
    const localMigrations = readdirSync(MIGRATIONS_DIR)
      .filter((fileName) => fileName.endsWith('.sql'))
      .map((fileName) => `supabase/migrations/${fileName}`)
      .toSorted();

    expect(new Set(classified).size).toBe(classified.length);
    expect(classified.toSorted()).toEqual(localMigrations);
    for (const migration of classified) {
      expect(existsSync(join(REPO_ROOT, migration))).toBe(true);
    }
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
    expect(parseReadonlyBashArray(script, 'CONTRACT_MIGRATIONS')).toContain(
      'supabase/migrations/20260810120100_restore_clerk_webhook_claim_retention.sql',
    );
    expect(parseReadonlyBashArray(script, 'EXPAND_MIGRATIONS')).not.toContain(
      'supabase/migrations/20260810120100_restore_clerk_webhook_claim_retention.sql',
    );
    expect(script).not.toContain('supabase db push');
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

const ARCHIVE_FILE = '20260706221000_archive_legacy_stripe_entitlements.sql';
const FAKE_SUPABASE = `#!/usr/bin/env bash
set -euo pipefail
printf 'CMD %s\\n' "$*" >> "$FAKE_SUPABASE_LOG"
if [[ "\${1:-}" == "db" && "\${2:-}" == "query" ]]; then
  cat "$FAKE_SUPABASE_APPLIED"
  exit 0
fi
workdir=""
args=("$@")
for ((i = 0; i < \${#args[@]}; i++)); do
  if [[ "\${args[i]}" == "--workdir" ]]; then
    workdir="\${args[i+1]}"
  fi
done
if [[ -n "$workdir" ]]; then
  printf 'WORKDIR %s\\n' "$workdir" >> "$FAKE_SUPABASE_LOG"
fi
if [[ "\${1:-}" == "migration" && "\${2:-}" == "up" ]]; then
  if [[ -z "$workdir" || ! -d "$workdir/supabase/migrations" ]]; then
    printf 'migration up missing workdir migrations\\n' >&2
    exit 1
  fi
  shopt -s nullglob
  for file in "$workdir/supabase/migrations"/*.sql; do
    printf 'WORKSPACE %s\\n' "\${file##*/}" >> "$FAKE_SUPABASE_LOG"
  done
fi
exit 0
`;

type RunnerFixture = {
  appliedPath: string;
  binDir: string;
  logPath: string;
  repoRoot: string;
};

type CommandResult = {
  status: number;
  stderr: string;
  stdout: string;
};

function formatBashArray(name: string, files: string[]): string {
  const body = files.map((file) => `  ${file}`).join('\n');
  return `readonly -a ${name}=(\n${body}${files.length > 0 ? '\n' : ''})`;
}

function patchManifest(
  script: string,
  expand: string[],
  contract: string[],
): string {
  return script
    .replace(
      /readonly -a EXPAND_MIGRATIONS=\([\s\S]*?\n\)/,
      formatBashArray('EXPAND_MIGRATIONS', expand),
    )
    .replace(
      /readonly -a CONTRACT_MIGRATIONS=\([\s\S]*?\n\)/,
      formatBashArray('CONTRACT_MIGRATIONS', contract),
    );
}

function workspaceFiles(log: string): string[] {
  return log
    .split('\n')
    .filter((line) => line.startsWith('WORKSPACE '))
    .map((line) => line.slice('WORKSPACE '.length))
    .toSorted();
}

describe('phased migration runner execution', () => {
  const fixtureRoots: string[] = [];

  afterEach(() => {
    for (const repoRoot of fixtureRoots.splice(0)) {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  function createRunnerFixture(options: {
    appliedVersions?: string[];
    contract: string[];
    expand: string[];
    files: string[];
  }): RunnerFixture {
    const repoRoot = mkdtempSync(join(tmpdir(), 'phased-migrations-'));
    fixtureRoots.push(repoRoot);
    const binDir = join(repoRoot, 'bin');
    const migrationsDir = join(repoRoot, 'supabase', 'migrations');
    const scriptsDir = join(repoRoot, 'scripts', 'db');
    mkdirSync(binDir, { recursive: true });
    mkdirSync(migrationsDir, { recursive: true });
    mkdirSync(scriptsDir, { recursive: true });
    writeFileSync(
      join(repoRoot, 'supabase', 'config.toml'),
      'project_id = "test"\n',
    );
    for (const fileName of options.files) {
      writeFileSync(join(migrationsDir, fileName), `-- ${fileName}\n`);
    }
    writeFileSync(
      join(scriptsDir, 'run-phased-migrations.sh'),
      patchManifest(
        readFileSync(PHASED_MIGRATION_SCRIPT, 'utf8'),
        options.expand.map((fileName) => `supabase/migrations/${fileName}`),
        options.contract.map((fileName) => `supabase/migrations/${fileName}`),
      ),
    );
    writeFileSync(
      join(scriptsDir, 'attest-effective-privileges.sh'),
      '#!/usr/bin/env bash\nexit 0\n',
      { mode: 0o755 },
    );
    const logPath = join(repoRoot, 'supabase.log');
    const appliedPath = join(repoRoot, 'applied.csv');
    writeFileSync(
      appliedPath,
      `${['version', ...(options.appliedVersions ?? [])].join('\n')}\n`,
    );
    writeFileSync(join(binDir, 'supabase'), FAKE_SUPABASE, { mode: 0o755 });
    return { appliedPath, binDir, logPath, repoRoot };
  }

  function runPhase(
    fixture: RunnerFixture,
    phase: 'expand' | 'contract',
    extraEnv: Record<string, string> = {},
  ): CommandResult {
    try {
      const stdout = execFileSync(
        'bash',
        [join(fixture.repoRoot, 'scripts/db/run-phased-migrations.sh')],
        {
          cwd: fixture.repoRoot,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            CONTRACT_CONFIRMATION: extraEnv.CONTRACT_CONFIRMATION ?? '',
            FAKE_SUPABASE_APPLIED: fixture.appliedPath,
            FAKE_SUPABASE_LOG: fixture.logPath,
            MIGRATION_PHASE: phase,
            PATH: `${fixture.binDir}:${process.env.PATH ?? ''}`,
            SUPABASE_PROJECT_ID: 'test-project',
            ...extraEnv,
          },
          timeout: 10_000,
        },
      );
      return { status: 0, stderr: '', stdout };
    } catch (error) {
      const err = error as {
        status?: number | null;
        stderr?: string;
        stdout?: string;
      };
      return {
        status: err.status ?? 1,
        stderr: err.stderr ?? '',
        stdout: err.stdout ?? '',
      };
    }
  }

  function readLog(fixture: RunnerFixture): string {
    return existsSync(fixture.logPath)
      ? readFileSync(fixture.logPath, 'utf8')
      : '';
  }

  it('fails unclassified pending migrations', () => {
    const fixture = createRunnerFixture({
      contract: [],
      expand: [],
      files: ['20260101000000_unclassified.sql'],
    });

    const result = runPhase(fixture, 'expand');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Unclassified pending migration: supabase/migrations/20260101000000_unclassified.sql',
    );
    expect(readLog(fixture)).not.toContain('CMD migration up');
  });

  it('fails when a migration is listed in both phase arrays', () => {
    const fixture = createRunnerFixture({
      contract: ['20260101000000_shared.sql'],
      expand: ['20260101000000_shared.sql'],
      files: ['20260101000000_shared.sql'],
    });

    const result = runPhase(fixture, 'expand');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Migration is classified as both expand and contract: supabase/migrations/20260101000000_shared.sql',
    );
    expect(readLog(fixture)).not.toContain('CMD migration up');
  });

  it('fails duplicate entries in the same phase array', () => {
    const fixture = createRunnerFixture({
      contract: [],
      expand: ['20260101000000_expand.sql', '20260101000000_expand.sql'],
      files: ['20260101000000_expand.sql'],
    });

    const result = runPhase(fixture, 'expand');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Duplicate EXPAND_MIGRATIONS entry: supabase/migrations/20260101000000_expand.sql',
    );
    expect(readLog(fixture)).not.toContain('CMD migration up');
  });

  it('fails when a manifest entry is missing on disk', () => {
    const fixture = createRunnerFixture({
      contract: [],
      expand: ['20260101000000_missing.sql'],
      files: [],
    });

    const result = runPhase(fixture, 'expand');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'EXPAND_MIGRATIONS references missing file: supabase/migrations/20260101000000_missing.sql',
    );
    expect(readLog(fixture)).not.toContain('CMD migration up');
  });

  it('fails contract while expand migrations remain pending', () => {
    const fixture = createRunnerFixture({
      appliedVersions: ['20260706221000'],
      contract: ['20260103000000_contract.sql'],
      expand: [ARCHIVE_FILE, '20260102000000_expand.sql'],
      files: [
        ARCHIVE_FILE,
        '20260102000000_expand.sql',
        '20260103000000_contract.sql',
      ],
    });

    const result = runPhase(fixture, 'contract', {
      CONTRACT_CONFIRMATION: 'post-deploy-health-verified',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Contract migrations cannot run while expand migrations are still pending:',
    );
    expect(result.stderr).toContain(
      'supabase/migrations/20260102000000_expand.sql',
    );
    expect(readLog(fixture)).not.toContain('CMD migration up');
  });

  it('applies only pending expand files in the expand workspace', () => {
    const fixture = createRunnerFixture({
      contract: ['20260103000000_contract.sql'],
      expand: ['20260102000000_expand.sql'],
      files: ['20260102000000_expand.sql', '20260103000000_contract.sql'],
    });

    const result = runPhase(fixture, 'expand');
    const log = readLog(fixture);

    expect(result.status).toBe(0);
    expect(log).toContain('CMD db query --linked --output csv');
    expect(log).toContain(
      'CMD migration up --linked --include-all --yes --workdir',
    );
    expect(log).not.toContain('db push');
    expect(workspaceFiles(log)).toEqual(['20260102000000_expand.sql']);
  });

  it('applies only pending contract files after expand is cleared', () => {
    const fixture = createRunnerFixture({
      appliedVersions: ['20260706221000', '20260102000000'],
      contract: ['20260103000000_contract.sql'],
      expand: [ARCHIVE_FILE, '20260102000000_expand.sql'],
      files: [
        ARCHIVE_FILE,
        '20260102000000_expand.sql',
        '20260103000000_contract.sql',
      ],
    });

    const result = runPhase(fixture, 'contract', {
      CONTRACT_CONFIRMATION: 'post-deploy-health-verified',
    });
    const log = readLog(fixture);

    expect(result.status).toBe(0);
    expect(log).toContain(
      'CMD migration up --linked --include-all --yes --workdir',
    );
    expect(log).not.toContain('db push');
    expect(workspaceFiles(log)).toEqual([
      '20260102000000_expand.sql',
      '20260103000000_contract.sql',
      ARCHIVE_FILE,
    ]);
  });

  it('copies applied migrations for history without treating them as pending', () => {
    const fixture = createRunnerFixture({
      appliedVersions: ['20260101000000'],
      contract: ['20260103000000_contract.sql'],
      expand: ['20260101000000_applied.sql', '20260102000000_expand.sql'],
      files: [
        '20260101000000_applied.sql',
        '20260102000000_expand.sql',
        '20260103000000_contract.sql',
      ],
    });

    const result = runPhase(fixture, 'expand');
    const log = readLog(fixture);

    expect(result.status).toBe(0);
    expect(log.indexOf('CMD db query')).toBeGreaterThan(-1);
    expect(log.indexOf('CMD db query')).toBeLessThan(
      log.indexOf('CMD migration up'),
    );
    expect(workspaceFiles(log)).toEqual([
      '20260101000000_applied.sql',
      '20260102000000_expand.sql',
    ]);
  });
});
