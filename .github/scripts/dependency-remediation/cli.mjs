import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseAudit } from './audit.mjs';
import { classifyRemediation } from './policy.mjs';
import { renderPlan, renderSummary } from './render.mjs';
import { inspectWorkspaceDiff } from './workspace.mjs';

const parseArgs = (argv) => {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    result[key] =
      argv[index + 1] && !argv[index + 1].startsWith('--')
        ? argv[++index]
        : true;
  }
  return result;
};

const readRequired = (file, label) => {
  if (typeof file !== 'string') throw new Error(`missing --${label}`);
  return readFileSync(file, 'utf8');
};

const writePlanArtifacts = (plan, outputDirectory, patchFile) => {
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(
    resolve(outputDirectory, 'plan.json'),
    `${JSON.stringify(plan, null, 2)}\n`,
  );
  writeFileSync(resolve(outputDirectory, 'pr-body.md'), renderPlan(plan));
  writeFileSync(resolve(outputDirectory, 'summary.md'), renderSummary(plan));
  if (patchFile)
    copyFileSync(patchFile, resolve(outputDirectory, 'remediation.patch'));
};

const verifyWorktree = (planFile, baseSha) => {
  const plan = JSON.parse(readRequired(planFile, 'plan'));
  const actual = execFileSync('git', ['diff', '--name-only', baseSha], {
    encoding: 'utf8',
  })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
  if (JSON.stringify(actual) !== JSON.stringify(plan.changedFiles ?? [])) {
    throw new Error(`worktree files differ from plan: ${actual.join(', ')}`);
  }
  if (
    actual.some(
      (file) => !['pnpm-lock.yaml', 'pnpm-workspace.yaml'].includes(file),
    )
  ) {
    throw new Error(
      'worktree contains a file outside the remediation allowlist',
    );
  }
  if (actual.includes('pnpm-workspace.yaml')) {
    const before = execFileSync(
      'git',
      ['show', `${baseSha}:pnpm-workspace.yaml`],
      { encoding: 'utf8' },
    );
    const after = readFileSync('pnpm-workspace.yaml', 'utf8');
    const workspace = inspectWorkspaceDiff(before, after);
    if (
      !workspace.valid ||
      JSON.stringify(workspace.additions) !==
        JSON.stringify(plan.releaseAgeExceptions ?? [])
    ) {
      throw new Error(
        workspace.error ?? 'worktree workspace policy diff failed validation',
      );
    }
  }
};

export function runCli(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);
  if (command === 'audit-status') {
    const audit = parseAudit(readRequired(args.file ?? args.input, 'file'));
    if (!audit.valid) {
      console.error(audit.error);
      process.exitCode = 2;
      return;
    }
    process.stdout.write(`${audit.clean ? 'clean' : 'vulnerable'}\n`);
    process.exitCode = audit.clean ? 0 : 1;
    return;
  }
  if (command === 'verify-worktree') {
    verifyWorktree(args.plan, args['base-sha']);
    return;
  }
  if (command === 'plan') {
    const beforeAudit = readRequired(args['before-audit'], 'before-audit');
    const afterAudit = readRequired(
      args['after-audit'] ?? args['before-audit'],
      'after-audit',
    );
    const changedFiles = readRequired(args['changed-files'], 'changed-files');
    const input = {
      baseSha: args['base-sha'],
      beforeAudit,
      afterAudit,
      changedFiles,
      versionsBefore: args['versions-before']
        ? readRequired(args['versions-before'], 'versions-before')
        : undefined,
      versionsAfter: args['versions-after']
        ? readRequired(args['versions-after'], 'versions-after')
        : undefined,
      workspaceBefore: args['workspace-before']
        ? readRequired(args['workspace-before'], 'workspace-before')
        : undefined,
      workspaceAfter: args['workspace-after']
        ? readRequired(args['workspace-after'], 'workspace-after')
        : undefined,
    };
    const plan = classifyRemediation(input);
    writePlanArtifacts(
      plan,
      args['out-dir'] ?? 'remediation-artifact',
      args['patch-file'],
    );
    process.stdout.write(`${plan.status}\n`);
    if (plan.status === 'rejected') process.exitCode = 1;
    return;
  }
  throw new Error(
    'usage: dependency-remediation.mjs <audit-status|plan|verify-worktree> ...',
  );
}
