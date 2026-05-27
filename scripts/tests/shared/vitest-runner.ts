import { spawn } from 'node:child_process';

type CommandRunOptions = {
  command: string;
  args: string[];
  env?: Partial<NodeJS.ProcessEnv>;
};

type VitestRunOptions = {
  project: string;
  testPath: string;
  extraArgs?: string[];
  env?: Partial<NodeJS.ProcessEnv>;
  watch?: boolean;
  changed?: boolean;
};

type VitestConfigRunOptions = Omit<VitestRunOptions, 'project'> & {
  config: string;
  passWithNoTests?: boolean;
};

export async function runCommand({
  command,
  args,
  env,
}: CommandRunOptions): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...env,
      },
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        resolve(1);
        return;
      }

      resolve(code ?? 1);
    });
  });
}

export async function runVitest({
  project,
  testPath,
  extraArgs = [],
  env,
  watch = false,
  changed = false,
}: VitestRunOptions): Promise<number> {
  const args = ['vitest', '--config', 'vitest.config.ts'];

  if (watch) {
    args.push('--project', project);
  } else {
    args.push('run', '--project', project);
  }

  if (changed) {
    args.push('--changed');
  }

  args.push(testPath, ...extraArgs);

  console.log(`Running: pnpm ${args.join(' ')}`);

  return await runCommand({
    command: 'pnpm',
    args,
    env: {
      NODE_ENV: 'test',
      ...env,
    },
  });
}

export async function runVitestConfig({
  config,
  testPath,
  extraArgs = [],
  env,
  watch = false,
  changed = false,
  passWithNoTests = false,
}: VitestConfigRunOptions): Promise<number> {
  const args = ['vitest', '--config', config];

  if (!watch) {
    args.push('run');
  }

  if (changed) {
    args.push('--changed');
  }

  if (passWithNoTests) {
    args.push('--passWithNoTests');
  }

  args.push(testPath, ...extraArgs);

  console.log(`Running: pnpm ${args.join(' ')}`);

  return await runCommand({
    command: 'pnpm',
    args,
    env: {
      NODE_ENV: 'test',
      ...env,
    },
  });
}
