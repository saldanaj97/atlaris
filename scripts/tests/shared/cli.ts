export interface ParsedRunnerArgs {
  testPath: string;
  watch: boolean;
  changed: boolean;
  extraArgs: string[];
  /** True when the user passed --help / -h. The runner should print its own help and return 0. */
  helpRequested: boolean;
}

export interface ParseRunnerArgsOptions {
  defaultTestPath: string;
}

type RunnerHelpOptions = {
  command: string;
  defaultTestPath: string;
  examples: string[];
  environment?: string[];
};

/**
 * Shared argv parser for the unit/integration/security vitest runners.
 * Each runner only differs in `defaultTestPath`, `printHelp` text, and
 * any extra env it injects (e.g. unit's SKIP_DB_TEST_SETUP).
 */
export function parseRunnerArgs(
  args: string[],
  { defaultTestPath }: ParseRunnerArgsOptions,
): ParsedRunnerArgs {
  let testPath = defaultTestPath;
  let remainingArgs = args;

  if (remainingArgs[0] && !remainingArgs[0].startsWith('-')) {
    testPath = remainingArgs[0];
    remainingArgs = remainingArgs.slice(1);
  }

  let watch = false;
  let changed = false;
  let helpRequested = false;
  const extraArgs: string[] = [];

  for (const arg of remainingArgs) {
    switch (arg) {
      case '--watch':
      case '-w':
        watch = true;
        break;
      case '--changed':
      case '-c':
        changed = true;
        break;
      case '--help':
      case '-h':
        helpRequested = true;
        break;
      default:
        extraArgs.push(arg);
        break;
    }
  }

  return { testPath, watch, changed, extraArgs, helpRequested };
}

export function printVitestRunnerHelp({
  command,
  defaultTestPath,
  environment = [],
  examples,
}: RunnerHelpOptions): void {
  console.log(
    `Usage: tsx scripts/tests/run.ts ${command} [test-path] [OPTIONS]`,
  );
  console.log('');
  console.log('Arguments:');
  console.log(
    `  test-path           Path to test file or directory (default: ${defaultTestPath})`,
  );
  console.log('');
  console.log('Options:');
  console.log(
    '  --changed, -c       Run only tests related to uncommitted changes',
  );
  console.log('  --watch, -w         Run in watch mode');
  console.log('  --help, -h          Show this help message');

  if (environment.length > 0) {
    console.log('');
    console.log('Environment:');
    for (const line of environment) {
      console.log(line);
    }
  }

  console.log('');
  console.log('Examples:');
  for (const example of examples) {
    console.log(example);
  }
}
