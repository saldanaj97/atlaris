import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, rmdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** One entry of `supabase stack list --output-format json`. */
export type ManagedStack = {
  id: string;
  project_root: string;
  name: string;
  branch_context: string;
};

export type PruneCandidate = { stack: ManagedStack; reason: string };

export type StackChecks = {
  projectRootExists: (projectRoot: string) => boolean;
  /** `undefined` when the answer is unknown (for example, not a git repo). */
  branchExists: (projectRoot: string, branch: string) => boolean | undefined;
};

const PROTECTED_BRANCHES = new Set(['main', 'develop', 'staging']);
const BRANCH_PREFIX = 'refs/heads/';

/**
 * A stack is prunable when its worktree folder is gone, or when its branch no
 * longer exists in a folder that still does. Protected branches, detached
 * contexts, and unknown branch state are kept.
 */
export function selectPrunableStacks(
  stacks: readonly ManagedStack[],
  checks: StackChecks,
): PruneCandidate[] {
  const candidates: PruneCandidate[] = [];
  for (const stack of stacks) {
    if (!checks.projectRootExists(stack.project_root)) {
      candidates.push({ stack, reason: 'worktree folder deleted' });
      continue;
    }
    if (!stack.branch_context.startsWith(BRANCH_PREFIX)) continue;
    const branch = stack.branch_context.slice(BRANCH_PREFIX.length);
    if (PROTECTED_BRANCHES.has(branch)) continue;
    if (checks.branchExists(stack.project_root, branch) === false) {
      candidates.push({ stack, reason: `branch ${branch} deleted` });
    }
  }
  return candidates;
}

export function destroyArgs(candidates: readonly PruneCandidate[]): string[] {
  return [
    'exec',
    'supabase',
    'stack',
    'destroy',
    '--yes',
    ...candidates.flatMap(({ stack }) => ['--stack-id', stack.id]),
  ];
}

function listStacks(): ManagedStack[] {
  const output = execFileSync(
    'pnpm',
    ['exec', 'supabase', 'stack', 'list', '--output-format', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
  return (JSON.parse(output) as { stacks: ManagedStack[] }).stacks;
}

const localChecks: StackChecks = {
  projectRootExists: (projectRoot) => existsSync(projectRoot),
  branchExists: (projectRoot, branch) => {
    const result = spawnSync(
      'git',
      [
        '-C',
        projectRoot,
        'rev-parse',
        '--verify',
        '--quiet',
        `${BRANCH_PREFIX}${branch}`,
      ],
      { stdio: 'ignore' },
    );
    if (result.status === 0) return true;
    if (result.status === 1) return false;
    return undefined;
  },
};

/**
 * `stack destroy` leaves an empty `<id>/data` folder behind. rmdir only
 * removes empty folders, so anything with content is reported, not deleted.
 */
function removeEmptyStackDirs(ids: readonly string[]): void {
  const stacksDir = join(homedir(), '.supabase', 'stacks');
  for (const id of ids) {
    const stackDir = join(stacksDir, id);
    for (const dir of [join(stackDir, 'data'), stackDir]) {
      try {
        rmdirSync(dir);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') continue;
        console.warn(`[db] Left ${dir} in place (${code ?? 'unknown error'}).`);
        break;
      }
    }
  }
}

function main(argv: readonly string[]): number {
  const apply = argv.includes('--yes');
  const candidates = selectPrunableStacks(listStacks(), localChecks);

  if (candidates.length === 0) {
    console.log('[db] No stale Supabase stacks to prune.');
    return 0;
  }

  for (const { stack, reason } of candidates) {
    console.log(
      `${stack.id.slice(0, 8)}  ${stack.name.padEnd(7)}  ${stack.project_root}  (${reason})`,
    );
  }

  if (!apply) {
    console.log(
      `[db] Dry run: ${candidates.length} stale stack(s). Run \`pnpm db prune --yes\` to destroy them and their data.`,
    );
    return 0;
  }

  const destroyed = spawnSync('pnpm', destroyArgs(candidates), {
    stdio: 'inherit',
  });
  if (destroyed.status !== 0) return destroyed.status ?? 1;

  removeEmptyStackDirs(candidates.map(({ stack }) => stack.id));
  console.log(`[db] Pruned ${candidates.length} stale stack(s).`);
  return 0;
}

const entrypoint = process.argv[1];
if (
  entrypoint !== undefined &&
  import.meta.url === pathToFileURL(entrypoint).href
) {
  process.exitCode = main(process.argv.slice(2));
}
