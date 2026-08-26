import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const CIRCLE_CI = readFileSync(
  join(REPO_ROOT, '.circleci', 'config.yml'),
  'utf8',
);
const TEST_SUITES = readFileSync(
  join(REPO_ROOT, '.circleci', 'test-suites.yml'),
  'utf8',
);
const CANDIDATE_COUNT =
  "COUNT=$(printf '%s\\n' \"${FILES}\" | awk 'NF { count += 1 } END { print count + 0 }')";
const [CI_PR_WORKFLOW] = CIRCLE_CI.split(/\n  ci-trunk:\n/);

describe('PR CI candidate file counting', () => {
  it('treats an empty filtered integration file list as zero candidates', () => {
    expect(CIRCLE_CI.split(CANDIDATE_COUNT)).toHaveLength(2);
    expect(CIRCLE_CI).not.toContain('echo "${FILES}" | wc -l');
  });

  it('routes unit selection, splitting, and impact refresh through Smarter Testing', () => {
    expect(CIRCLE_CI).toContain('circleci testsuite run "unit tests"');
    expect(CIRCLE_CI).toContain('--analyze-tests=impacted --run-tests=none');
    expect(TEST_SUITES).toContain('test-impact-analysis: true');
    expect(TEST_SUITES).toContain('dynamic-test-splitting: true');
  });

  it('allows related mode to pass when no integration tests match', () => {
    const relatedMode = CIRCLE_CI.match(/related\)([\s\S]*?)\n\s*;;/)?.[1];

    expect(relatedMode).toContain('--passWithNoTests');
  });
});

describe('CircleCI PR merge gate', () => {
  it('runs ci-pr on develop-headed pull_request events', () => {
    const pullRequestGate = CI_PR_WORKFLOW.match(
      /equal: \[pull_request, << pipeline\.event\.name >>\][\s\S]*?equal: \[opened,/,
    )?.[0];
    expect(pullRequestGate).toBeDefined();
    // non-main includes develop → main; do not match the push-clause develop exclusion
    expect(pullRequestGate).toContain(
      'equal: [main, << pipeline.git.branch >>]',
    );
    expect(pullRequestGate).not.toContain(
      'equal: [develop, << pipeline.git.branch >>]',
    );
  });

  it('runs ci-pr on feature-branch pull_request events so auto-cancel cannot leave an empty pipeline', () => {
    const pullRequestGate = CI_PR_WORKFLOW.match(
      /equal: \[pull_request, << pipeline\.event\.name >>\][\s\S]*?equal: \[opened,/,
    )?.[0];
    expect(pullRequestGate).toBeDefined();
    expect(pullRequestGate).toContain(
      'equal: [main, << pipeline.git.branch >>]',
    );
    expect(pullRequestGate).not.toContain(
      'equal: [develop, << pipeline.git.branch >>]',
    );
  });

  it('does not skip develop on ci-pr jobs', () => {
    expect(CI_PR_WORKFLOW).not.toContain('ignore: [main, develop]');
  });

  it('diffs pull_request runs against the PR base branch', () => {
    expect(CIRCLE_CI).toContain('pipeline.event.github.pull_request.base.ref');
  });

  it('keeps ci-trunk off pull_request events', () => {
    expect(CIRCLE_CI).toContain(
      'equal: [pull_request, << pipeline.event.name >>]',
    );
    expect(CIRCLE_CI).toMatch(
      /ci-trunk:\n    when:\n      not:\n        equal: \[pull_request, << pipeline\.event\.name >>\]/,
    );
  });

  it('does not keep GitHub Actions ci-trunk.yml', () => {
    expect(
      existsSync(join(REPO_ROOT, '.github', 'workflows', 'ci-trunk.yml')),
    ).toBe(false);
  });
});
