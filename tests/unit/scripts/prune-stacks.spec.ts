import {
  destroyArgs,
  selectPrunableStacks,
  type ManagedStack,
  type StackChecks,
} from '../../../scripts/db/prune-stacks';
import { describe, expect, it } from 'vitest';

function stack(
  id: string,
  projectRoot: string,
  branchContext: string,
  name = 'default',
): ManagedStack {
  return {
    id,
    project_root: projectRoot,
    name,
    branch_context: branchContext,
  };
}

function checks(
  existingRoots: string[],
  branches: Record<string, boolean | undefined>,
): StackChecks {
  return {
    projectRootExists: (root) => existingRoots.includes(root),
    branchExists: (root, branch) => branches[`${root}:${branch}`],
  };
}

describe('selectPrunableStacks', () => {
  it('prunes every stack whose worktree folder is gone, whatever its name', () => {
    const gone = stack('a1', '/wt/gone', 'refs/heads/feat/x');
    const goneTest = stack('a2', '/wt/gone', 'refs/heads/feat/x', 'test');

    expect(selectPrunableStacks([gone, goneTest], checks([], {}))).toEqual([
      { stack: gone, reason: 'worktree folder deleted' },
      { stack: goneTest, reason: 'worktree folder deleted' },
    ]);
  });

  it('prunes a stack whose branch was deleted in a folder that still exists', () => {
    const stale = stack('b1', '/repo', 'refs/heads/feat/merged');
    const live = stack('b2', '/repo', 'refs/heads/feat/open');

    expect(
      selectPrunableStacks(
        [stale, live],
        checks(['/repo'], {
          '/repo:feat/merged': false,
          '/repo:feat/open': true,
        }),
      ),
    ).toEqual([{ stack: stale, reason: 'branch feat/merged deleted' }]);
  });

  it('keeps protected branches, detached contexts, and unknown branch state', () => {
    const stacks = [
      stack('c1', '/repo', 'refs/heads/develop'),
      stack('c2', '/repo', 'refs/heads/main'),
      stack('c3', '/repo', 'detached-sha'),
      stack('c4', '/not-a-repo', 'refs/heads/feat/x'),
    ];

    expect(
      selectPrunableStacks(
        stacks,
        checks(['/repo', '/not-a-repo'], {
          '/repo:develop': false,
          '/repo:main': false,
          '/not-a-repo:feat/x': undefined,
        }),
      ),
    ).toEqual([]);
  });
});

describe('destroyArgs', () => {
  it('destroys all candidates in one non-interactive call by full id', () => {
    const candidates = selectPrunableStacks(
      [
        stack('d1', '/gone', 'refs/heads/a'),
        stack('d2', '/gone', 'refs/heads/b'),
      ],
      checks([], {}),
    );

    expect(destroyArgs(candidates)).toEqual([
      'exec',
      'supabase',
      'stack',
      'destroy',
      '--yes',
      '--stack-id',
      'd1',
      '--stack-id',
      'd2',
    ]);
  });
});
