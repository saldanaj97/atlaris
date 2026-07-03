import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const WORKFLOWS_DIR = join(REPO_ROOT, '.github', 'workflows');

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
      expect(workflow).toContain(`branches:\n      - ${protectedBranch}`);
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
});
