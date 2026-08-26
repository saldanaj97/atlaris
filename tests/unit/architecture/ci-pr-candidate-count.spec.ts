import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CIRCLE_CI = readFileSync(
  join(import.meta.dirname, '..', '..', '..', '.circleci', 'config.yml'),
  'utf8',
);
const CANDIDATE_COUNT =
  "COUNT=$(printf '%s\\n' \"${FILES}\" | awk 'NF { count += 1 } END { print count + 0 }')";
const [CI_PR_WORKFLOW] = CIRCLE_CI.split(/\n  ci-trunk:\n/);

describe('PR CI candidate file counting', () => {
  it('treats an empty filtered file list as zero candidates in every consumer', () => {
    expect(CIRCLE_CI.split(CANDIDATE_COUNT)).toHaveLength(3);
    expect(CIRCLE_CI).not.toContain('echo "${FILES}" | wc -l');
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

  it('keeps ci-trunk off pull_request events', () => {
    expect(CIRCLE_CI).toContain(
      'equal: [pull_request, << pipeline.event.name >>]',
    );
    expect(CIRCLE_CI).toMatch(
      /ci-trunk:\n    when:\n      not:\n        equal: \[pull_request, << pipeline\.event\.name >>\]/,
    );
  });
});
