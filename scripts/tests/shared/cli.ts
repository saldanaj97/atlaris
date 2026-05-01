interface ParsedRunnerArgs {
  testPath: string;
  watch: boolean;
  changed: boolean;
  extraArgs: string[];
  /** True when the user passed --help / -h. The runner should print its own help and return 0. */
  helpRequested: boolean;
}

interface ParseRunnerArgsOptions {
  defaultTestPath: string;
}

type RunnerHelpOptions = {
  command: string;
  defaultTestPath: string;
  examples: string[];
  environment?: string[];
};

type RunnerFlagSink = {
  watch: boolean;
  changed: boolean;
  helpRequested: boolean;
  extraArgs: string[];
};

const RUNNER_KNOWN_ARG_HANDLERS: Record<
  string,
  (sink: RunnerFlagSink) => void
> = {
  '--watch': (sink) => {
    sink.watch = true;
  },
  '-w': (sink) => {
    sink.watch = true;
  },
  '--changed': (sink) => {
    sink.changed = true;
  },
  '-c': (sink) => {
    sink.changed = true;
  },
  '--help': (sink) => {
    sink.helpRequested = true;
  },
  '-h': (sink) => {
    sink.helpRequested = true;
  },
};

function splitOptionalTestPath(
  args: string[],
  defaultTestPath: string,
): { testPath: string; flagArgs: string[] } {
  if (args[0] && !args[0].startsWith('-')) {
    return { testPath: args[0], flagArgs: args.slice(1) };
  }
  return { testPath: defaultTestPath, flagArgs: args };
}

function collectRunnerFlags(
  flagArgs: string[],
): Omit<ParsedRunnerArgs, 'testPath'> {
  const sink: RunnerFlagSink = {
    watch: false,
    changed: false,
    helpRequested: false,
    extraArgs: [],
  };

  for (const arg of flagArgs) {
    const handler = RUNNER_KNOWN_ARG_HANDLERS[arg];
    if (handler) {
      handler(sink);
    } else {
      sink.extraArgs.push(arg);
    }
  }

  return {
    watch: sink.watch,
    changed: sink.changed,
    helpRequested: sink.helpRequested,
    extraArgs: sink.extraArgs,
  };
}

/**
 * Shared argv parser for the unit/integration/security vitest runners.
 * Each runner only differs in `defaultTestPath`, `printHelp` text, and
 * any extra env it injects (e.g. unit's SKIP_DB_TEST_SETUP).
 */
export function parseRunnerArgs(
  args: string[],
  { defaultTestPath }: ParseRunnerArgsOptions,
): ParsedRunnerArgs {
  const { testPath, flagArgs } = splitOptionalTestPath(args, defaultTestPath);
  return { testPath, ...collectRunnerFlags(flagArgs) };
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
