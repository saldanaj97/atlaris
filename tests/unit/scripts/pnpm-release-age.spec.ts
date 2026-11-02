import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const WRAPPER = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'scripts',
  'ci',
  'pnpm-release-age.sh',
);
const UNSET = '<unset>';

let root: string;
let fakeBin: string;
let plainDir: string;

type RunOptions = {
  env?: Record<string, string>;
  cwd?: string;
  args?: string[];
};

type RunResult = {
  status: number | null;
  value: string;
  args: string;
  ageVars: string[];
  stderr: string;
};

// Minimal env: no inherited CI vars; the fake pnpm shadows any real one.
function run({
  env = {},
  cwd = plainDir,
  args = ['install'],
}: RunOptions = {}): RunResult {
  const result = spawnSync('sh', [WRAPPER, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      PATH: `${fakeBin}:/usr/bin:/bin`,
      NODE_ENV: 'test',
      HOME: root,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_CEILING_DIRECTORIES: root,
      ...env,
    },
  });
  const [value = '', argLine = '', ...rest] = result.stdout.split('\n');
  return {
    status: result.status,
    value,
    args: argLine,
    ageVars: rest.filter(Boolean),
    stderr: result.stderr,
  };
}

function git(cwd: string, ...args: string[]): void {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0)
    throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'pnpm-release-age-'));
  fakeBin = join(root, 'bin');
  plainDir = join(root, 'plain');
  mkdirSync(fakeBin);
  mkdirSync(plainDir);
  writeFileSync(
    join(fakeBin, 'pnpm'),
    `#!/bin/sh\nprintf '%s\\n' "\${pnpm_config_minimum_release_age-${UNSET}}"\nprintf '%s\\n' "$*"\nenv | grep -i 'minimum_release_age' | sort\n`,
    { mode: 0o755 },
  );
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('pnpm-release-age.sh', () => {
  it.each(['main', 'hotfix/fix-x', 'hotfix/a/b'])(
    'skips release age on %s',
    (branch) => {
      const result = run({ env: { CIRCLE_BRANCH: branch } });
      expect(result.status).toBe(0);
      expect(result.value).toBe('0');
      expect(result.stderr).toContain(
        `skipping minimumReleaseAge for branch ${branch}`,
      );
    },
  );

  it.each([
    'hotfix/',
    'develop',
    'feature/x',
    'mainline',
    'hotfix-x',
    'xhotfix/y',
    'release/main',
  ])('keeps release age strict on %s', (branch) => {
    const result = run({ env: { CIRCLE_BRANCH: branch } });
    expect(result.status).toBe(0);
    expect(result.value).toBe(UNSET);
    expect(result.stderr).toContain('enforcing minimumReleaseAge');
  });

  it.each([
    ['VERCEL_GIT_COMMIT_REF', { VERCEL_GIT_COMMIT_REF: 'main' }],
    ['WORKERS_CI_BRANCH', { WORKERS_CI_BRANCH: 'hotfix/z' }],
    ['GITHUB_HEAD_REF', { GITHUB_HEAD_REF: 'hotfix/z' }],
    [
      'GITHUB_REF_NAME on a branch',
      { GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'main' },
    ],
  ])('reads the branch from %s', (_name, env) => {
    expect(run({ env }).value).toBe('0');
  });

  it('is strict with no branch information', () => {
    const result = run();
    expect(result.value).toBe(UNSET);
    expect(result.stderr).toContain('branch unknown');
  });

  it('removes an inherited override outside main and hotfix', () => {
    const result = run({
      env: {
        CIRCLE_BRANCH: 'feature/x',
        pnpm_config_minimum_release_age: '0',
        PNPM_CONFIG_MINIMUM_RELEASE_AGE: '0',
        pnpm_config_minimum_release_age_strict: 'false',
        PNPM_CONFIG_MINIMUM_RELEASE_AGE_STRICT: 'false',
        npm_config_minimum_release_age: '0',
        NPM_CONFIG_MINIMUM_RELEASE_AGE: '0',
      },
    });
    expect(result.value).toBe(UNSET);
    expect(result.ageVars).toEqual([]);
  });

  it('overrides an inherited age on main', () => {
    const result = run({
      env: { CIRCLE_BRANCH: 'main', pnpm_config_minimum_release_age: '10080' },
    });
    expect(result.value).toBe('0');
  });

  it.each([
    ['CircleCI', { CIRCLE_BRANCH: 'hotfix/x', RELEASE_AGE_PR_BASE: 'develop' }],
    ['GitHub', { GITHUB_HEAD_REF: 'hotfix/x', GITHUB_BASE_REF: 'develop' }],
  ])('stays strict for a %s hotfix PR into develop', (_name, env) => {
    const result = run({ env });
    expect(result.value).toBe(UNSET);
    expect(result.stderr).toContain('(PR into develop)');
  });

  it('skips release age for a hotfix PR into main', () => {
    const result = run({
      env: { CIRCLE_BRANCH: 'hotfix/x', RELEASE_AGE_PR_BASE: 'main' },
    });
    expect(result.value).toBe('0');
  });

  it('uses GITHUB_HEAD_REF before the PR merge ref', () => {
    const result = run({
      env: {
        GITHUB_HEAD_REF: 'feature/x',
        GITHUB_REF_TYPE: 'branch',
        GITHUB_REF_NAME: 'main',
      },
    });
    expect(result.value).toBe(UNSET);
  });

  it('uses CIRCLE_BRANCH before other providers', () => {
    const result = run({
      env: { CIRCLE_BRANCH: 'feature/x', VERCEL_GIT_COMMIT_REF: 'main' },
    });
    expect(result.value).toBe(UNSET);
  });

  it('ignores GITHUB_REF_NAME when the ref is a tag', () => {
    const result = run({
      env: { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'main' },
    });
    expect(result.value).toBe(UNSET);
  });

  it('falls back to the git branch', () => {
    const hotfix = join(root, 'git-hotfix');
    mkdirSync(hotfix);
    git(hotfix, 'init', '--quiet');
    git(hotfix, 'symbolic-ref', 'HEAD', 'refs/heads/hotfix/y');
    expect(run({ cwd: hotfix }).value).toBe('0');

    const feature = join(root, 'git-feature');
    mkdirSync(feature);
    git(feature, 'init', '--quiet');
    git(feature, 'symbolic-ref', 'HEAD', 'refs/heads/feature/y');
    expect(run({ cwd: feature }).value).toBe(UNSET);
  });

  it('passes arguments through to pnpm', () => {
    const result = run({
      env: { CIRCLE_BRANCH: 'main' },
      args: ['install', '--frozen-lockfile', '--store-dir', '/x y'],
    });
    expect(result.args).toBe('install --frozen-lockfile --store-dir /x y');
  });
});
