import { classifyDeploymentPaths } from './deployment-classifier.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const classifierPath = fileURLToPath(
  new URL('./deployment-classifier.mjs', import.meta.url),
);
const workflow = readFileSync(
  new URL('../workflows/vercel-deploy.yml', import.meta.url),
  'utf8',
);
const circleCiConfig = readFileSync(
  new URL('../../.circleci/code-config.yml', import.meta.url),
  'utf8',
);

test('skips only docs, root Markdown, and issue-template paths', () => {
  for (const changedFiles of [
    ['docs/ci-cd/deploy.md'],
    ['README.md'],
    ['.github/ISSUE_TEMPLATE/bug.yml'],
    ['docs/ci-cd/deploy.md', 'README.md', '.github/ISSUE_TEMPLATE/bug.yml'],
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
  for (const changedFiles of [['docs/ci-cd/deploy.md'], undefined]) {
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
  const decision = workflow.split('\n  preview:\n')[0];

  assert.equal(
    decision.match(/git diff --no-renames --name-only/gu)?.length,
    3,
  );
});

test('the workflow keeps unavailable secrets out of automated previews', () => {
  assert.match(workflow, /PR_AUTHOR:.*pull_request\.user\.login/u);
  assert.match(workflow, /dependabot-secrets-unavailable/u);
  assert.ok(workflow.includes(`[[ "\${fork_guard}" == 'eligible' ]]`));
});

test('Preview remote-builds with step-scoped credentials and a full wait budget', () => {
  const preview = workflow
    .split('\n  preview:\n')[1]
    ?.split('\n  staging:\n')[0];

  assert.ok(preview);
  assert.match(preview, /timeout-minutes: 40/u);
  assert.doesNotMatch(preview, /^    env:/mu);
  assert.doesNotMatch(preview, /vercel link/u);
  assert.doesNotMatch(preview, /vercel pull/u);
  assert.doesNotMatch(preview, /vercel build/u);
  assert.doesNotMatch(preview, /--prebuilt/u);
  assert.match(preview, /vercel deploy --no-wait --yes/u);
  assert.match(
    preview,
    /Inspect Preview deployment[\s\S]*VERCEL_TOKEN:.*secrets\.VERCEL_TOKEN/u,
  );
});

test('deployment inspection reports the checkout SHA without fake ref checks', () => {
  const deploymentLanes = workflow.split('\n  preview:\n')[1];

  assert.ok(deploymentLanes);
  assert.equal(
    deploymentLanes.match(/source_sha="\$\(git rev-parse HEAD\)"/gu)?.length,
    3,
  );
  assert.doesNotMatch(deploymentLanes, /source_ref=/u);
  assert.doesNotMatch(deploymentLanes, /test "\$\{source_ref\}"/u);
  assert.doesNotMatch(deploymentLanes, /\| Exact ref \|/u);
});

test('the workflow preserves the Staging migration gate across develop pushes', () => {
  assert.match(workflow, /refs\/remotes\/origin\/main/u);
  assert.match(workflow, /staging_base="\$\(git merge-base/u);
  assert.ok(
    workflow.includes(
      `"\${deploy}" == 'true' &&\n            "\${reason}" != 'unknown diff'`,
    ),
  );
  assert.ok(
    workflow.includes(`! grep -q '^supabase/migrations/' "\${changed_files}"`),
  );
  assert.ok(
    workflow.includes(
      `needs.deployment-decision.outputs.staging_auto_eligible == 'true'`,
    ),
  );
  assert.match(workflow, /candidate_sha == github\.sha/u);
});

test('the workflow waits for same-SHA CircleCI trunk success before Staging', () => {
  const staging = workflow
    .split('\n  staging:\n')[1]
    ?.split('\n  production-candidate:\n')[0];

  assert.ok(staging);
  assert.match(workflow, /checks: read/u);
  assert.match(staging, /commits\/\$\{EXPECTED_SHA\}\/check-runs/u);
  assert.match(staging, /circleci-checks/u);
  assert.match(staging, /startswith\("ci-trunk - "\)/u);
  assert.match(staging, /conclusion.*success/u);
  assert.match(staging, /timeout-minutes: 75/u);
});

test('Production waits for same-SHA CircleCI trunk success before deploy', () => {
  const production = workflow.split('\n  production-candidate:\n')[1];

  assert.ok(production);
  assert.match(production, /Wait for same-SHA CircleCI trunk success/u);
  assert.ok(
    production.indexOf('Wait for same-SHA CircleCI trunk success') <
      production.indexOf('Deploy gated Production candidate'),
  );
  assert.match(production, /timeout-minutes: 75/u);
});

test('deployment jobs serialize without coalescing decision runs', () => {
  assert.doesNotMatch(workflow, /^concurrency:/mu);
  assert.match(workflow, /group: vercel-preview-/u);
  assert.match(workflow, /group: vercel-staging-develop/u);
  assert.match(workflow, /group: vercel-production-main/u);
});

test('manual Staging requires a successful same-SHA expand run', () => {
  assert.match(workflow, /actions: read/u);
  assert.match(
    workflow,
    /actions\/workflows\/staging-db-migrations\.yaml\/runs/u,
  );
  assert.ok(workflow.includes(`-f head_sha="\${EXPECTED_SHA}"`));
  assert.match(workflow, /Staging migrations \(expand\) @ \$\{EXPECTED_SHA\}/u);
  assert.match(workflow, /\.head_sha == \$expected_sha/u);
});

test('the classifier and workflow assertions run in CircleCI', () => {
  assert.match(
    circleCiConfig,
    /node --test[\s\S]*dependency-remediation\.test\.mjs[\s\S]*deployment-classifier\.test\.mjs/u,
  );
});

test('Production uses a remote build behind both readiness gates', () => {
  assert.ok(
    workflow.includes(`vars.VERCEL_NATIVE_GIT_DISABLED == 'true'`) &&
      workflow.includes(`vars.VERCEL_DEPLOYMENT_CHECKS_READY == 'true'`),
  );
  assert.match(workflow, /vercel deploy --prod --no-wait --yes/u);
  assert.doesNotMatch(workflow, /vercel pull --yes --environment=production/u);
  assert.doesNotMatch(workflow, /vercel build --prod --yes/u);
  assert.doesNotMatch(workflow, /vercel deploy --prebuilt --prod/u);
});
