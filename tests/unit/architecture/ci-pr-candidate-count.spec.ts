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
const DRAFT_GATE =
  'equal: [false, << pipeline.event.github.pull_request.draft >>]';
const DOCS_CONFIG_PATH = '.circleci/docs-config.yml';
const CODE_CONFIG_PATH = '.circleci/code-config.yml';
const SHARED_CONFIG_PATH = '.circleci/shared-config.yml';
const VERCEL_CONFIG = JSON.parse(
  readFileSync(join(REPO_ROOT, 'vercel.json'), 'utf8'),
) as {
  $schema: string;
  git: { deploymentEnabled: Record<string, boolean> };
  crons: Array<{ path: string; schedule: string }>;
};
const VERCEL_DEPLOY_WORKFLOW = readFileSync(
  join(REPO_ROOT, '.github', 'workflows', 'vercel-deploy.yml'),
  'utf8',
);

type ContinuationSelection = {
  parameters: Record<string, boolean>;
  configs: Set<string>;
};

const parseSetupMapping = () => {
  const body = SETUP_CONFIG.match(
    /mapping: &config-mapping \|\n((?: {12}.+\n)+)/,
  )?.[1];

  expect(body).toBeDefined();

  return (body ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const [pattern, parameter, value, config] = line.split(/\s+/u);
      return {
        pattern,
        parameter,
        value: JSON.parse(value) as boolean,
        config,
      };
    });
};

// Mirrors circleci/path-filtering@1.3.0: compile('^' + pattern + '$').
const selectContinuation = (paths: string[]): ContinuationSelection => {
  const parameters: Record<string, boolean> = {};
  const configs = new Set<string>();

  for (const { pattern, parameter, value, config } of parseSetupMapping()) {
    const matcher = new RegExp(`^${pattern}$`);
    if (paths.some((path) => matcher.test(path))) {
      parameters[parameter] = value;
      configs.add(config);
    }
  }

  return {
    parameters,
    configs: configs.size > 0 ? configs : new Set(['.circleci/no-updates.yml']),
  };
};

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
    expect(CODE_CONFIG).toContain(
      '<testsuites><testsuite name="github-workflow-scripts">',
    );
    expect(CODE_CONFIG).toContain('</testsuite></testsuites>');

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

describe('CircleCI change flags', () => {
  it('attaches detected flags before selecting the lint command', () => {
    const lintJob = CODE_CONFIG.match(
      /\n  lint-and-type-check:\n([\s\S]*?)\n  vulnerability-scan:/,
    )?.[1];

    expect(lintJob).toContain(
      '- attach_workspace:\n          at: /tmp/.ci-flags',
    );
    expect(lintJob?.indexOf('attach_workspace')).toBeLessThan(
      lintJob?.indexOf('lint_command') ?? -1,
    );
  });
});

describe('CircleCI PR merge gate', () => {
  it('runs ci-pr on develop-headed pull_request events', () => {
    const pullRequestGate = CI_PR_WORKFLOW.match(
      /equal: \[pull_request, << pipeline\.event\.name >>\][\s\S]*?equal: \[opened,/,
    )?.[0];
    expect(pullRequestGate).toBeDefined();
    // non-main includes develop → main
    expect(pullRequestGate).toContain(
      'equal: [main, << pipeline.git.branch >>]',
    );
    expect(pullRequestGate).not.toContain(
      'equal: [develop, << pipeline.git.branch >>]',
    );
  });

  it('runs ci-pr on feature-branch pull_request events', () => {
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
    expect(SETUP_CONFIG).not.toContain('\n  setup-default:\n');
  });

  it('does not skip develop on ci-pr jobs', () => {
    expect(CI_PR_WORKFLOW).not.toContain('ignore: [main, develop]');
  });

  it('diffs pull_request runs against the PR base branch', () => {
    expect(SETUP_CONFIG).toContain(
      'pipeline.event.github.pull_request.base.ref',
    );
  });

  it('diffs main and develop pushes against pipeline.git.base_revision', () => {
    expect(SETUP_CONFIG).toMatch(
      /setup-main:[\s\S]*base-revision: << pipeline\.git\.base_revision >>/,
    );
    expect(SETUP_CONFIG).toMatch(
      /setup-develop:[\s\S]*base-revision: << pipeline\.git\.base_revision >>/,
    );
    expect(SETUP_CONFIG).not.toMatch(/setup-main:[\s\S]*base-revision: main/);
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

  it('suppresses setup-pr on draft pull requests', () => {
    const setupPr = SETUP_CONFIG.match(
      /\n  setup-pr:\n([\s\S]*?)\n  setup-main:/,
    )?.[1];

    expect(setupPr).toContain(
      'equal: [pull_request, << pipeline.event.name >>]',
    );
    expect(setupPr).toContain(DRAFT_GATE);
  });

  it('suppresses ci-pr on draft pull requests and keeps ready_for_review', () => {
    const ciPrWhen = CODE_CONFIG.match(
      /\n  ci-pr:\n    when:\n([\s\S]*?)\n    jobs:/,
    )?.[1];

    expect(ciPrWhen).toContain(DRAFT_GATE);
    expect(ciPrWhen).toContain(
      'equal: [ready_for_review, << pipeline.event.action >>]',
    );
  });
});

describe('CircleCI cheap-path continuation mapping', () => {
  it.each([
    {
      label: 'docs tree',
      paths: ['docs/guide.md'],
      expectedConfig: DOCS_CONFIG_PATH,
    },
    {
      label: 'root Markdown',
      paths: ['README.md'],
      expectedConfig: DOCS_CONFIG_PATH,
    },
    {
      label: 'issue templates',
      paths: ['.github/ISSUE_TEMPLATE/bug.yml'],
      expectedConfig: DOCS_CONFIG_PATH,
    },
    {
      label: 'nested Markdown',
      paths: ['nested/README.md'],
      expectedConfig: CODE_CONFIG_PATH,
    },
    {
      label: 'issue-template file',
      paths: ['.github/ISSUE_TEMPLATE.md'],
      expectedConfig: CODE_CONFIG_PATH,
    },
    {
      label: 'mixed docs and code',
      paths: ['docs/guide.md', 'src/app/page.tsx'],
      expectedConfig: CODE_CONFIG_PATH,
    },
  ])('routes $label to $expectedConfig', ({ paths, expectedConfig }) => {
    const selected = selectContinuation(paths);

    expect(selected.configs.has(SHARED_CONFIG_PATH)).toBe(true);
    expect(selected.configs.has(expectedConfig)).toBe(true);

    if (expectedConfig === DOCS_CONFIG_PATH) {
      expect(selected.parameters['docs-changed']).toBe(true);
      expect(selected.parameters['code-changed']).toBeUndefined();
      expect(selected.configs.has(CODE_CONFIG_PATH)).toBe(false);
      return;
    }

    expect(selected.parameters['code-changed']).toBe(true);
    expect(selected.configs.has(CODE_CONFIG_PATH)).toBe(true);
  });
});

describe('Vercel native Git partial cutover', () => {
  it('disables native Git for every branch except main', () => {
    expect(VERCEL_CONFIG.$schema).toBe('https://openapi.vercel.sh/vercel.json');
    expect(VERCEL_CONFIG.git.deploymentEnabled).toEqual({
      '**': false,
      main: true,
    });
    expect(VERCEL_CONFIG.crons).toEqual([
      {
        path: '/api/cron/notifications/email?runKind=daily',
        schedule: '0 14 * * *',
      },
      {
        path: '/api/cron/notifications/email?runKind=weekly',
        schedule: '30 14 * * 1',
      },
    ]);
  });

  it('leaves the Production workflow gated on VERCEL_NATIVE_GIT_DISABLED', () => {
    expect(VERCEL_DEPLOY_WORKFLOW).toContain(
      "vars.VERCEL_NATIVE_GIT_DISABLED == 'true'",
    );
  });
});
