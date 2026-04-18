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

/**
 * Shared argv parser for the unit/integration/security vitest runners.
 * Each runner only differs in `defaultTestPath`, `printHelp` text, and
 * any extra env it injects (e.g. unit's SKIP_DB_TEST_SETUP).
 */
export function parseRunnerArgs(
  args: string[],
  { defaultTestPath }: ParseRunnerArgsOptions
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
