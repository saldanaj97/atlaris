import { resolveChangedTestBase } from './changed-base';
import { aggregateExitCode, runPhases } from './run-phases';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const VITEST_CONFIG = 'vitest.config.ts';
const WORKFLOW_VITEST_CONFIG = 'vitest.workflow.config.ts';

type EnvironmentOverrides = Partial<NodeJS.ProcessEnv>;

export type TestCommand = {
  executable: string;
  args: string[];
  env?: EnvironmentOverrides;
};

export type TestPhase = {
  label: string;
  commands: readonly TestCommand[];
  stopOnFailure?: boolean;
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
      '  pnpm test unit [--changed]',
      '  pnpm test integration [--changed]',
      '  pnpm test workflow',
      '  pnpm test security',
      '  pnpm test smoke [options]',
      '  pnpm test e2e',
      '  pnpm test all [--e2e]',
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

function unitPhase(changed: boolean): TestPhase {
  return {
    label: changed ? 'unit --changed' : 'unit',
    commands: [
      vitestCommand(
        [
          '--config',
          VITEST_CONFIG,
          '--project',
          'unit',
          ...(changed ? changedArgs() : []),
          'tests/unit',
        ],
        { SKIP_DB_TEST_SETUP: 'true', NODE_ENV: 'test' },
      ),
    ],
  };
}

function integrationPhase(changed: boolean): TestPhase {
  const commands: TestCommand[] = [
    vitestCommand(
      [
        '--config',
        VITEST_CONFIG,
        '--project',
        'integration',
        ...(changed ? changedArgs() : []),
        'tests/integration',
      ],
      { NODE_ENV: 'test' },
    ),
  ];

  if (changed) {
    commands.push(
      vitestCommand(
        [
          '--config',
          WORKFLOW_VITEST_CONFIG,
          ...changedArgs(),
          '--passWithNoTests',
          'tests/workflow',
        ],
        { NODE_ENV: 'test' },
      ),
    );
  }

  return {
    label: changed ? 'integration --changed' : 'integration',
    commands,
    // The old integration-changed package script joined these commands with
    // `&&`; preserve that short-circuit while keeping the phase aggregate.
    stopOnFailure: changed,
  };
}

function workflowPhase(): TestPhase {
  return {
    label: 'workflow',
    commands: [
      vitestCommand(['--config', WORKFLOW_VITEST_CONFIG, 'tests/workflow'], {
        NODE_ENV: 'test',
      }),
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

function e2ePhase(): TestPhase {
  return {
    label: 'e2e',
    commands: [
      vitestCommand(
        ['--config', VITEST_CONFIG, '--project', 'e2e', 'tests/e2e'],
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

function defaultPlan(): TestPhase[] {
  return [unitPhase(true), integrationPhase(true)];
}

function allPlan(includeE2e: boolean): TestPhase[] {
  return [
    checkPhase(),
    unitPhase(false),
    integrationPhase(false),
    workflowPhase(),
    securityPhase(),
    ...(includeE2e ? [e2ePhase()] : []),
  ];
}

function stripArgumentSeparator(argv: readonly string[]): string[] {
  return argv[0] === '--' ? argv.slice(1) : [...argv];
}

function parseChangedOption(args: readonly string[]): boolean {
  if (args.length === 0) return false;
  if (args.length === 1 && args[0] === '--changed') return true;
  usage();
}

/** Build the direct command plan for the public `pnpm test` interface. */
export function parseTestArgs(argv: readonly string[]): TestPhase[] {
  const args = stripArgumentSeparator(argv);
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
      return [unitPhase(parseChangedOption(options))];
    case 'integration':
      return [integrationPhase(parseChangedOption(options))];
    case 'workflow':
      if (options.length > 0) usage();
      return [workflowPhase()];
    case 'security':
      if (options.length > 0) usage();
      return [securityPhase()];
    case 'smoke':
      return [smokePhase(options)];
    case 'e2e':
      if (options.length > 0) usage();
      return [e2ePhase()];
    case 'all':
      if (options.length === 0) return allPlan(false);
      if (options.length === 1 && options[0] === '--e2e') {
        return allPlan(true);
      }
      usage();
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
    if (phase.stopOnFailure) return exitCode;
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
