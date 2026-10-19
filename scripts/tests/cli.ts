import {
  NATIVE_TEST_DB,
  TEST_DB_ENV,
} from '../../tests/setup/native-test-stack';
import { resolveChangedTestBase } from './changed-base';
import { aggregateExitCode, runPhases } from './run-phases';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const VITEST_CONFIG = 'vitest.config.ts';
const NATIVE_DB_FLAG = '--native-db';

type EnvironmentOverrides = Partial<NodeJS.ProcessEnv>;

export type TestCommand = {
  executable: string;
  args: string[];
  env?: EnvironmentOverrides;
};

export type TestPhase = {
  label: string;
  commands: readonly TestCommand[];
};

export class TestCliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TestCliUsageError';
  }
}

function usage(): never {
  throw new TestCliUsageError(
    [
      'Usage:',
      '  pnpm test',
      '  pnpm test unit [--changed] [paths...]',
      '  pnpm test integration [--changed] [paths...]',
      '  pnpm test security',
      '  pnpm test smoke [options]',
      '  pnpm test all',
      '',
      `Add ${NATIVE_DB_FLAG} to any suite to use the native Supabase "test" stack`,
      `instead of Testcontainers (same as ${TEST_DB_ENV}=${NATIVE_TEST_DB}).`,
    ].join('\n'),
  );
}

function pnpmCommand(
  args: string[],
  env: EnvironmentOverrides = {},
): TestCommand {
  return { executable: 'pnpm', args, env };
}

function vitestCommand(
  args: string[],
  env: EnvironmentOverrides = {},
): TestCommand {
  return pnpmCommand(['vitest', 'run', ...args], env);
}

function changedArgs(): string[] {
  return ['--changed', resolveChangedTestBase()];
}

type SuiteOptions = {
  changed: boolean;
  paths: string[];
};

function unitPhase({ changed, paths }: SuiteOptions): TestPhase {
  return {
    label: changed ? 'unit --changed' : 'unit',
    commands: [
      vitestCommand(
        [
          '--config',
          VITEST_CONFIG,
          '--project',
          'unit',
          '--project',
          'unit-dom',
          ...(changed ? changedArgs() : []),
          ...(paths.length > 0 ? paths : ['tests/unit']),
        ],
        { SKIP_DB_TEST_SETUP: 'true', NODE_ENV: 'test' },
      ),
    ],
  };
}

function integrationPhase({ changed, paths }: SuiteOptions): TestPhase {
  return {
    label: changed ? 'integration --changed' : 'integration',
    commands: [
      vitestCommand(
        [
          '--config',
          VITEST_CONFIG,
          '--project',
          'integration',
          ...(changed ? changedArgs() : []),
          ...(paths.length > 0 ? paths : ['tests/integration']),
        ],
        { NODE_ENV: 'test' },
      ),
    ],
  };
}

function securityPhase(): TestPhase {
  return {
    label: 'security',
    commands: [
      vitestCommand(
        ['--config', VITEST_CONFIG, '--project', 'security', 'tests/security'],
        { NODE_ENV: 'test' },
      ),
    ],
  };
}

function smokePhase(args: readonly string[]): TestPhase {
  const forwardedArgs = args[0] === '--' ? args.slice(1) : args;
  return {
    label:
      forwardedArgs.length > 0 ? `smoke ${forwardedArgs.join(' ')}` : 'smoke',
    commands: [
      pnpmCommand([
        'exec',
        'tsx',
        'scripts/tests/smoke/run.ts',
        ...forwardedArgs,
      ]),
    ],
  };
}

function checkPhase(): TestPhase {
  return {
    label: 'check',
    commands: [pnpmCommand(['check'])],
  };
}

const CHANGED_ONLY: SuiteOptions = { changed: true, paths: [] };
const FULL_SUITE: SuiteOptions = { changed: false, paths: [] };

function defaultPlan(): TestPhase[] {
  return [unitPhase(CHANGED_ONLY), integrationPhase(CHANGED_ONLY)];
}

function allPlan(): TestPhase[] {
  return [
    checkPhase(),
    unitPhase(FULL_SUITE),
    integrationPhase(FULL_SUITE),
    securityPhase(),
  ];
}

function stripArgumentSeparator(argv: readonly string[]): string[] {
  return argv[0] === '--' ? argv.slice(1) : [...argv];
}

function parseSuiteOptions(args: readonly string[]): SuiteOptions {
  const options: SuiteOptions = { changed: false, paths: [] };
  for (const arg of args) {
    if (arg === '--changed' && !options.changed) {
      options.changed = true;
    } else if (arg.startsWith('-')) {
      usage();
    } else {
      options.paths.push(arg);
    }
  }
  return options;
}

/** Remove `--native-db` from the runner's own options (not Playwright's). */
function extractNativeDbFlag(args: readonly string[]): {
  args: string[];
  nativeDb: boolean;
} {
  const separator = args.indexOf('--');
  const own = separator === -1 ? args : args.slice(0, separator);
  const forwarded = separator === -1 ? [] : args.slice(separator);
  const kept = own.filter((arg) => arg !== NATIVE_DB_FLAG);

  return {
    args: [...kept, ...forwarded],
    nativeDb: kept.length !== own.length,
  };
}

function withNativeTestDb(plan: readonly TestPhase[]): TestPhase[] {
  return plan.map((phase) => ({
    ...phase,
    commands: phase.commands.map((command) => ({
      ...command,
      env: { ...command.env, [TEST_DB_ENV]: NATIVE_TEST_DB },
    })),
  }));
}

/** Build the direct command plan for the public `pnpm test` interface. */
export function parseTestArgs(argv: readonly string[]): TestPhase[] {
  const { args, nativeDb } = extractNativeDbFlag(stripArgumentSeparator(argv));
  const plan = parseSuitePlan(args);
  return nativeDb ? withNativeTestDb(plan) : plan;
}

function parseSuitePlan(args: readonly string[]): TestPhase[] {
  const suite = args[0];
  const options = args.slice(1);

  if (!suite) {
    return defaultPlan();
  }

  if (suite === '--changed') {
    if (args.length !== 1) usage();
    return defaultPlan();
  }

  switch (suite) {
    case 'unit':
      return [unitPhase(parseSuiteOptions(options))];
    case 'integration':
      return [integrationPhase(parseSuiteOptions(options))];
    case 'security':
      if (options.length > 0) usage();
      return [securityPhase()];
    case 'smoke':
      return [smokePhase(options)];
    case 'all':
      if (options.length > 0) usage();
      return allPlan();
  }

  usage();
}

export function runTestCommand(command: TestCommand): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command.executable, command.args, {
      stdio: 'inherit',
      env: { ...process.env, ...command.env },
    });

    child.on('close', (code) => {
      resolve(code ?? 1);
    });

    child.on('error', () => {
      resolve(1);
    });
  });
}

export type TestCommandRunner = (command: TestCommand) => Promise<number>;

async function runPhase(
  phase: TestPhase,
  runCommand: TestCommandRunner,
): Promise<number> {
  let firstFailure: number | undefined;

  for (const command of phase.commands) {
    const exitCode = await runCommand(command);
    if (exitCode === 0) continue;

    firstFailure ??= exitCode;
  }

  return firstFailure ?? 0;
}

export async function runTestPlan(
  plan: readonly TestPhase[],
  runCommand: TestCommandRunner = runTestCommand,
): Promise<number> {
  const phases = new Map(plan.map((phase) => [phase.label, phase]));
  const results = await runPhases(
    plan.map((phase) => phase.label),
    async (label) => {
      const phase = phases.get(label);
      if (!phase) return 1;
      return runPhase(phase, runCommand);
    },
  );

  if (results.length === 1) {
    return results[0]?.exitCode ?? 1;
  }

  return aggregateExitCode(results);
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];
  return (
    entrypoint !== undefined &&
    import.meta.url === pathToFileURL(entrypoint).href
  );
}

async function main(): Promise<void> {
  try {
    process.exitCode = await runTestPlan(parseTestArgs(process.argv.slice(2)));
  } catch (error) {
    if (error instanceof TestCliUsageError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

if (isDirectExecution()) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
