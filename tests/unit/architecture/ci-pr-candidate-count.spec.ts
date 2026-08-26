import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const SETUP_CONFIG = readFileSync(
  join(REPO_ROOT, '.circleci', 'config.yml'),
  'utf8',
);
const CODE_CONFIG = readFileSync(
  join(REPO_ROOT, '.circleci', 'code-config.yml'),
  'utf8',
);
const TEST_SUITES = readFileSync(
  join(REPO_ROOT, '.circleci', 'test-suites.yml'),
  'utf8',
);
const CANDIDATE_COUNT =
  "COUNT=$(printf '%s\\n' \"${FILES}\" | awk 'NF { count += 1 } END { print count + 0 }')";
const [CI_PR_WORKFLOW] = CODE_CONFIG.split(/\n  ci-trunk:\n/);

describe('PR CI candidate file counting', () => {
  it('treats an empty filtered integration file list as zero candidates', () => {
    expect(CODE_CONFIG.split(CANDIDATE_COUNT)).toHaveLength(2);
    expect(CODE_CONFIG).not.toContain('echo "${FILES}" | wc -l');
  });

  it('routes unit selection, splitting, and impact refresh through Smarter Testing', () => {
    expect(CODE_CONFIG).toContain('circleci testsuite run "unit tests"');
    expect(CODE_CONFIG).toContain('--analyze-tests=impacted --run-tests=none');
    expect(TEST_SUITES).toContain('test-impact-analysis: true');
    expect(TEST_SUITES).toContain('dynamic-test-splitting: true');
  });

  it('allows related mode to pass when no integration tests match', () => {
    const relatedMode = CODE_CONFIG.match(/related\)([\s\S]*?)\n\s*;;/)?.[1];

    expect(relatedMode).toContain('--passWithNoTests');
  });
});

describe('CircleCI test result collection', () => {
  it('stores every runnable suite under a dedicated result directory', () => {
    expect(CODE_CONFIG).toContain(
      '- store_test_results:\n          path: test-results',
    );
    expect(TEST_SUITES).toContain('junit: test-results/unit/junit.xml');

    for (const path of [
      'test-results/integration-light/junit.xml',
      'test-results/integration/junit.xml',
      'test-results/security/junit.xml',
      'test-results/workflow/node.xml',
      'test-results/workflow/vitest.xml',
    ]) {
      expect(CODE_CONFIG).toContain(path);
    }
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
    expect(SETUP_CONFIG).toContain(
      'pipeline.event.github.pull_request.base.ref',
    );
  });

  it('keeps ci-trunk off pull_request events', () => {
    expect(CODE_CONFIG).toContain(
      'equal: [pull_request, << pipeline.event.name >>]',
    );
    expect(CODE_CONFIG).toMatch(
      /ci-trunk:\n    when:\n      not:\n        equal: \[pull_request, << pipeline\.event\.name >>\]/,
    );
  });

  it('does not keep GitHub Actions ci-trunk.yml', () => {
    expect(
      existsSync(join(REPO_ROOT, '.github', 'workflows', 'ci-trunk.yml')),
    ).toBe(false);
  });
});
