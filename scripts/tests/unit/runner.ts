import { parseRunnerArgs, printVitestRunnerHelp } from '../shared/cli';
import { runVitest } from '../shared/vitest-runner';

function printHelp(): void {
  printVitestRunnerHelp({
    command: 'unit',
    defaultTestPath: 'tests/unit',
    examples: [
      '  tsx scripts/tests/run.ts unit',
      '  tsx scripts/tests/run.ts unit --changed',
      '  tsx scripts/tests/run.ts unit --watch',
      '  tsx scripts/tests/run.ts unit tests/unit/services',
      '  tsx scripts/tests/run.ts unit tests/unit/my.test.ts',
    ],
  });
}

export async function runUnitCommand(args: string[]): Promise<number> {
  const parsed = parseRunnerArgs(args, { defaultTestPath: 'tests/unit' });

  if (parsed.helpRequested) {
    printHelp();
    return 0;
  }

  return await runVitest({
    project: 'unit',
    testPath: parsed.testPath,
    extraArgs: parsed.extraArgs,
    watch: parsed.watch,
    changed: parsed.changed,
    env: {
      SKIP_DB_TEST_SETUP: 'true',
    },
  });
}
