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

test('deployment jobs keep orchestration and privileges scoped', () => {
  const topLevel = workflow.split('\njobs:\n')[0];
  const staging = workflow
    .split('\n  staging:\n')[1]
    ?.split('\n  production-candidate:\n')[0];
  const production = workflow.split('\n  production-candidate:\n')[1];

  assert.ok(topLevel);
  assert.ok(staging);
  assert.ok(production);
  assert.equal(workflow.match(/persist-credentials: false/gu)?.length, 4);
  assert.doesNotMatch(topLevel, /actions: read|checks: read/u);
  for (const deployment of [staging, production]) {
    const jobHeader = deployment.split('\n    steps:\n')[0];

    assert.match(deployment, /actions: read/u);
    assert.match(deployment, /checks: read/u);
    assert.match(deployment, /contents: read/u);
    assert.doesNotMatch(jobHeader, /secrets\.VERCEL_/u);
  }
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

test('edited PR title or body skips cheaply and base edits error', () => {
  const decision = workflow.split('\n  preview:\n')[0];
  const dispatch = workflow
    .split('workflow_dispatch:')[1]
    ?.split('permissions:')[0];

  assert.ok(decision);
  assert.ok(dispatch);
  assert.match(
    workflow,
    /types: \[opened, synchronize, reopened, ready_for_review, edited\]/u,
  );
  assert.match(decision, /reason='non-base PR edit'/u);
  assert.match(decision, /set_error 'PR base changed'/u);
  assert.match(decision, /PR_BASE_REF_FROM:.*changes\.base\.ref\.from/u);
  assert.match(decision, /continue-on-error: true/u);
  assert.match(
    decision,
    /decision_error: \$\{\{ steps\.decision\.outputs\.decision_error \}\}/u,
  );
  assert.match(
    decision,
    /decision_error_reason: \$\{\{ steps\.decision\.outputs\.decision_error_reason \}\}/u,
  );
  assert.match(
    decision,
    /if: always\(\) && steps\.decision\.outputs\.decision_error == 'true'/u,
  );
  assert.match(decision, /::error::\$\{DECISION_ERROR_REASON\}/u);
  assert.match(decision, /set_error 'automated checkout failure'/u);
  assert.match(decision, /set_error 'event SHA mismatch'/u);
  assert.match(decision, /set_error 'trusted base fetch\/resolve failure'/u);
  assert.match(
    decision,
    /set_error 'unable to produce valid source\/candidate'/u,
  );
  assert.match(decision, /set_error 'stale or invalid manual request'/u);
  assert.doesNotMatch(dispatch, /^\s+ref:/mu);
  assert.match(dispatch, /commit_sha:/u);
  assert.match(dispatch, /git_branch:/u);
});

test('manual dispatch trusts an exact SHA that is an ancestor of git_branch', () => {
  const decision = workflow.split('\n  preview:\n')[0];

  assert.ok(decision);
  assert.match(decision, /MANUAL_COMMIT_SHA: \$\{\{ inputs\.commit_sha \}\}/u);
  assert.match(decision, /MANUAL_GIT_BRANCH: \$\{\{ inputs\.git_branch \}\}/u);
  assert.match(
    decision,
    /git check-ref-format --branch -- "\$\{MANUAL_GIT_BRANCH:-\}"/u,
  );
  assert.match(
    decision,
    /refs\/heads\/\$\{MANUAL_GIT_BRANCH\}:refs\/remotes\/origin\/\$\{MANUAL_GIT_BRANCH\}/u,
  );
  assert.match(
    decision,
    /git merge-base --is-ancestor \\\s+"\$\{MANUAL_COMMIT_SHA\}"/u,
  );
  assert.ok(decision.includes(`"\${GITHUB_REF:-}" == 'refs/heads/develop'`));
  assert.ok(decision.includes(`"\${MANUAL_GIT_BRANCH}" == 'develop'`));
  assert.ok(decision.includes(`"\${MANUAL_COMMIT_SHA}" == "\${GITHUB_SHA:-}"`));
  assert.match(
    workflow,
    /vercel-preview-\$\{\{ github\.event\.pull_request\.number \|\| inputs\.commit_sha \|\| github\.run_id \}\}/u,
  );
  assert.match(
    workflow,
    /github\.event_name == 'pull_request' && github\.event\.pull_request\.head\.ref \|\| inputs\.git_branch/u,
  );
});

test('draft pull requests cannot become secret-deploy eligible', () => {
  assert.match(workflow, /ready_for_review/u);
  assert.match(
    workflow,
    /PR_DRAFT: \$\{\{ github\.event\.pull_request\.draft \}\}/u,
  );
  assert.ok(workflow.includes(`"\${PR_DRAFT:-false}" != 'true'`));
  assert.ok(workflow.includes(`[[ "\${fork_guard}" == 'eligible' ]]`));
});

test('Preview and Staging check out shallowly while Production keeps history', () => {
  const decision = workflow.split('\n  preview:\n')[0];
  const preview = workflow
    .split('\n  preview:\n')[1]
    ?.split('\n  staging:\n')[0];
  const staging = workflow
    .split('\n  staging:\n')[1]
    ?.split('\n  production-candidate:\n')[0];
  const production = workflow.split('\n  production-candidate:\n')[1];

  assert.ok(decision);
  assert.ok(preview);
  assert.ok(staging);
  assert.ok(production);
  assert.match(decision, /fetch-depth: 0/u);
  assert.match(preview, /fetch-depth: 1/u);
  assert.match(staging, /fetch-depth: 1/u);
  assert.match(production, /fetch-depth: 0/u);
  assert.doesNotMatch(preview, /fetch-depth: 0/u);
  assert.doesNotMatch(staging, /fetch-depth: 0/u);
});

test('Staging remote-builds and drops unused pnpm, link, pull, and prebuilt steps', () => {
  const staging = workflow
    .split('\n  staging:\n')[1]
    ?.split('\n  production-candidate:\n')[0];
  const production = workflow.split('\n  production-candidate:\n')[1];
  const stagingHeader = staging?.split('\n    steps:\n')[0];
  const productionHeader = production?.split('\n    steps:\n')[0];

  assert.ok(staging);
  assert.ok(production);
  assert.ok(stagingHeader);
  assert.ok(productionHeader);
  assert.doesNotMatch(staging, /pnpm\/action-setup/u);
  assert.doesNotMatch(staging, /vercel link/u);
  assert.doesNotMatch(staging, /vercel pull/u);
  assert.doesNotMatch(staging, /vercel build/u);
  assert.doesNotMatch(staging, /--prebuilt/u);
  assert.match(staging, /vercel deploy --no-wait --yes/u);
  assert.doesNotMatch(production, /pnpm\/action-setup/u);
  assert.doesNotMatch(production, /vercel link/u);
  assert.doesNotMatch(stagingHeader, /secrets\.VERCEL_/u);
  assert.doesNotMatch(productionHeader, /secrets\.VERCEL_/u);
  assert.match(
    staging,
    /Deploy develop Preview artifact[\s\S]*VERCEL_TOKEN:.*secrets\.VERCEL_TOKEN/u,
  );
  assert.match(
    staging,
    /Inspect develop Preview deployment[\s\S]*VERCEL_TOKEN:.*secrets\.VERCEL_TOKEN/u,
  );
});

test('every CLI deploy sets explicit GitHub metadata and verifies it via the API', () => {
  const deploymentLanes = workflow.split('\n  preview:\n')[1];

  assert.ok(deploymentLanes);
  assert.equal(workflow.match(/--meta githubDeployment=1/gu)?.length, 3);
  assert.equal(workflow.match(/--meta "githubOrg=/gu)?.length, 3);
  assert.equal(workflow.match(/--meta "githubRepo=/gu)?.length, 3);
  assert.equal(workflow.match(/--meta "githubCommitOrg=/gu)?.length, 3);
  assert.equal(workflow.match(/--meta "githubCommitRepo=/gu)?.length, 3);
  assert.equal(workflow.match(/--meta "githubCommitRef=/gu)?.length, 3);
  assert.equal(workflow.match(/--meta "githubCommitSha=/gu)?.length, 3);
  assert.doesNotMatch(workflow, /VERCEL_GIT_COMMIT_REF/u);
  assert.equal(
    workflow.match(
      /api\.vercel\.com\/v13\/deployments\/\$\{deployment_id\}\?teamId=\$\{VERCEL_ORG_ID\}/gu,
    )?.length,
    3,
  );
  assert.match(
    deploymentLanes,
    /\.meta\.githubDeployment == "1" and \.meta\.githubCommitSha == \$sha and \.meta\.githubCommitRef == \$ref/u,
  );
  assert.doesNotMatch(workflow, /echo ["'].*VERCEL_TOKEN/u);
  assert.doesNotMatch(workflow, /curl [^\n]*\s-[^\n]*v/u);
});

test('CircleCI lookup uses filter=all and keeps polling queued reruns', () => {
  const selector = workflow.match(
    /\[\.\[\]\.check_runs\[\] \| select\([\s\S]*?\)\] \| max_by\(\.id\) \/\/ \{\}/u,
  )?.[0];
  const staging = workflow
    .split('\n  staging:\n')[1]
    ?.split('\n  production-candidate:\n')[0];
  const production = workflow.split('\n  production-candidate:\n')[1];

  assert.ok(selector);
  assert.ok(staging);
  assert.ok(production);
  const stagingWait = staging.split(
    'Wait for same-SHA CircleCI trunk success',
  )[1];
  const productionWait = production.split(
    'Wait for same-SHA CircleCI trunk success',
  )[1];

  assert.ok(stagingWait);
  assert.ok(productionWait);
  assert.equal(workflow.match(/filter=all&per_page=100/gu)?.length, 2);
  for (const wait of [stagingWait, productionWait]) {
    assert.match(wait, /check_run_pages="\$\(/u);
    assert.match(wait, /gh api --paginate --slurp/u);
    assert.doesNotMatch(wait, /gh api --paginate --slurp[\s\S]*?--jq/u);
    assert.doesNotMatch(wait, /--jq/u);
    assert.match(wait, /check_run_pages='\[\]'/u);
    assert.match(wait, /jq -c '\[\.\[\]\.check_runs\[\] \| select\(/u);
    assert.match(wait, /<<<"\$\{check_run_pages\}"/u);
  }
  assert.equal(workflow.match(/max_by\(\.id\) \/\/ \{\}/gu)?.length, 2);
  assert.equal(
    workflow.match(/\[\.\[\]\.check_runs\[\] \| select\(/gu)?.length,
    2,
  );
  assert.ok(
    workflow.includes(
      `"\${status}" == 'queued' || "\${status}" == 'in_progress'`,
    ),
  );

  const queuedTrunk = {
    id: 22,
    app: { slug: 'circleci-checks' },
    name: 'ci-trunk - lint',
    status: 'queued',
    conclusion: null,
  };
  const result = spawnSync('jq', ['-c', selector], {
    encoding: 'utf8',
    input: JSON.stringify([
      {
        check_runs: [
          {
            id: 1,
            app: { slug: 'github-actions' },
            name: 'lint',
            status: 'completed',
            conclusion: 'success',
          },
          {
            id: 11,
            app: { slug: 'github-actions' },
            name: 'test',
            status: 'completed',
            conclusion: 'success',
          },
        ],
      },
      {
        check_runs: [
          {
            id: 11,
            app: { slug: 'circleci-checks' },
            name: 'ci-trunk - lint',
            status: 'completed',
            conclusion: 'success',
          },
          queuedTrunk,
        ],
      },
    ]),
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), queuedTrunk);
});

test('summaries no longer claim native Git may duplicate non-main deploys', () => {
  assert.doesNotMatch(workflow, /may create a duplicate/iu);
  assert.doesNotMatch(workflow, /Native Git remains enabled/u);
});
