import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { classifyDeploymentPaths } from './deployment-classifier.mjs';

const classifierPath = fileURLToPath(
  new URL('./deployment-classifier.mjs', import.meta.url),
);
const workflow = readFileSync(
  new URL('../workflows/vercel-deploy.yml', import.meta.url),
  'utf8',
);

test('skips only docs, root Markdown, and issue-template paths', () => {
  for (const changedFiles of [
    ['docs/ci-cd/deploy.md'],
    ['README.md'],
    ['.github/ISSUE_TEMPLATE/bug.yml'],
    [
      'docs/ci-cd/deploy.md',
      'README.md',
      '.github/ISSUE_TEMPLATE/bug.yml',
    ],
  ]) {
    assert.deepEqual(classifyDeploymentPaths(changedFiles), {
      deploy: false,
      reason: 'docs-only',
    });
  }
});

test('deploys for application, mixed, config, and workflow paths', () => {
  for (const changedFiles of [
    ['src/app/page.tsx'],
    ['docs/ci-cd/deploy.md', 'src/app/page.tsx'],
    ['README.md', 'package.json'],
    ['nested/README.md'],
    ['.github/ISSUE_TEMPLATE.md'],
    ['.github/ISSUE_TEMPLATE_BACKUP/bug.yml'],
    ['package.json'],
    ['next.config.ts'],
    ['tsconfig.json'],
    ['vercel.json'],
    ['supabase/migrations/0001.sql'],
    ['scripts/release.ts'],
    ['.github/workflows/ci-pr.yml'],
  ]) {
    assert.deepEqual(classifyDeploymentPaths(changedFiles), {
      deploy: true,
      reason: 'deploy-impacting path',
    });
  }
});

test('fails open when the diff is missing, empty, ambiguous, or malformed', () => {
  for (const changedFiles of [
    undefined,
    null,
    [],
    new Array(1),
    [undefined],
    ['docs/ci-cd/deploy.md', undefined],
    'docs/ci-cd/deploy.md',
    ['docs/ci-cd/deploy.md', ''],
    ['docs/ci-cd/deploy.md', null],
    ['docs/ci-cd/deploy.md', 'broken\npath'],
    ['docs/../package.json'],
    ['docs/./page.tsx'],
    ['docs//page.tsx'],
    ['./README.md'],
    ['/README.md'],
    ['C:/README.md'],
    ['docs\\guide.md'],
    ['.'],
    ['..'],
  ]) {
    assert.deepEqual(classifyDeploymentPaths(changedFiles), {
      deploy: true,
      reason: 'unknown diff',
    });
  }
});

test('a forced deploy overrides docs-only and unknown diffs', () => {
  for (const changedFiles of [
    ['docs/ci-cd/deploy.md'],
    undefined,
  ]) {
    assert.deepEqual(
      classifyDeploymentPaths(changedFiles, { forceDeploy: true }),
      {
        deploy: true,
        reason: 'forced',
      },
    );
  }
});

test('the CLI keeps force deploy independent from the changed-files value', () => {
  const result = spawnSync(
    process.execPath,
    [classifierPath, '--changed-files', '--force-deploy'],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'deploy=true\nreason=forced\n');
  assert.equal(result.stderr, '');
});

test('the workflow classifies both sides of renames', () => {
  assert.equal(
    workflow.match(/git diff --no-renames --name-only/gu)?.length,
    2,
  );
});

test('the workflow keeps unavailable secrets out of automated previews', () => {
  assert.match(workflow, /PR_AUTHOR:.*pull_request\.user\.login/u);
  assert.match(workflow, /dependabot-secrets-unavailable/u);
  assert.ok(workflow.includes(`[[ "\${fork_guard}" == 'eligible' ]]`));
});

test('the workflow gates Staging migrations and Production release readiness', () => {
  assert.ok(
    workflow.includes(`! grep -q '^supabase/migrations/' "\${changed_files}"`),
  );
  assert.ok(
    workflow.includes(
      `needs.deployment-decision.outputs.staging_auto_eligible == 'true'`,
    ),
  );
  assert.match(workflow, /candidate_sha == github\.sha/u);
  assert.ok(
    workflow.includes(`vars.VERCEL_NATIVE_GIT_DISABLED == 'true'`) &&
      workflow.includes(`vars.VERCEL_DEPLOYMENT_CHECKS_READY == 'true'`),
  );
  assert.match(workflow, /vercel deploy --prebuilt --prod --no-wait --yes/u);
  assert.doesNotMatch(
    workflow,
    /vercel deploy --prebuilt --prod --skip-domain/u,
  );
});
