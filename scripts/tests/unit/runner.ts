import { parseRunnerArgs } from '../shared/cli';
import { runVitest } from '../shared/vitest-runner';

function printHelp(): void {
  console.log('Usage: tsx scripts/tests/run.ts unit [test-path] [OPTIONS]');
  console.log('');
  console.log('Arguments:');
  console.log('  test-path           Path to test file or directory (default: tests/unit)');
  console.log('');
  console.log('Options:');
  console.log('  --changed, -c       Run only tests related to uncommitted changes');
  console.log('  --watch, -w         Run in watch mode');
  console.log('  --help, -h          Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  tsx scripts/tests/run.ts unit');
  console.log('  tsx scripts/tests/run.ts unit --changed');
  console.log('  tsx scripts/tests/run.ts unit --watch');
  console.log('  tsx scripts/tests/run.ts unit tests/unit/services');
  console.log('  tsx scripts/tests/run.ts unit tests/unit/my.test.ts');
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
