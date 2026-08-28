import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const isValidDiffPath = (file) =>
  typeof file === 'string' &&
  file.length > 0 &&
  !file.endsWith('/') &&
  !/[\u0000-\u001f\u007f]/u.test(file) &&
  !file.startsWith('/') &&
  !file.includes('\\') &&
  !/^[A-Za-z]:\//u.test(file) &&
  file
    .split('/')
    .every((component) => component !== '' && component !== '.' && component !== '..');

const isSkippablePath = (file) =>
  file.startsWith('docs/') ||
  file.startsWith('.github/ISSUE_TEMPLATE/') ||
  (!file.includes('/') && file.endsWith('.md'));

export function classifyDeploymentPaths(changedFiles, options = {}) {
  if (options?.forceDeploy === true) return { deploy: true, reason: 'forced' };
  if (
    !Array.isArray(changedFiles) ||
    changedFiles.length === 0 ||
    changedFiles.some((file) => !isValidDiffPath(file))
  ) {
    return { deploy: true, reason: 'unknown diff' };
  }
  if (changedFiles.every(isSkippablePath)) {
    return { deploy: false, reason: 'docs-only' };
  }
  return { deploy: true, reason: 'deploy-impacting path' };
}

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--changed-files') {
      const value = argv[index + 1];
      if (value && !value.startsWith('--')) {
        args.changedFiles = value;
        index += 1;
      }
    } else if (argv[index] === '--force-deploy') {
      args.forceDeploy = true;
    }
  }
  return args;
};

const readChangedFiles = (file) => {
  if (typeof file !== 'string') return undefined;
  try {
    const contents = readFileSync(file, 'utf8');
    if (contents.length === 0) return [];
    const lines = contents.split(/\r?\n/u);
    if (lines.at(-1) === '') lines.pop();
    return lines;
  } catch {
    return undefined;
  }
};

export function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const decision = classifyDeploymentPaths(readChangedFiles(args.changedFiles), {
    forceDeploy: args.forceDeploy,
  });
  process.stdout.write(`deploy=${decision.deploy}\nreason=${decision.reason}\n`);
  return decision;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  runCli();
}
