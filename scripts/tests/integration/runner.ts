import { parseRunnerArgs } from '../shared/cli';
import { runVitest } from '../shared/vitest-runner';

function printHelp(): void {
  console.log(
    'Usage: tsx scripts/tests/run.ts integration [test-path] [OPTIONS]',
  );
  console.log('');
  console.log('Arguments:');
  console.log(
    '  test-path           Path to test file or directory (default: tests/integration)',
  );
  console.log('');
  console.log('Options:');
  console.log(
    '  --changed, -c       Run only tests related to uncommitted changes',
  );
  console.log('  --watch, -w         Run in watch mode');
  console.log('  --help, -h          Show this help message');
  console.log('');
  console.log('Environment:');
  console.log(
    '  INTEGRATION_MAX_WORKERS   Override integration worker count (default: 4 with Testcontainers)',
  );
  console.log(
    '  TEST_DB_DEBUG=true        Log worker-to-database mapping during setup',
  );
  console.log('');
  console.log('Examples:');
  console.log('  tsx scripts/tests/run.ts integration');
  console.log(
    '  tsx scripts/tests/run.ts integration tests/integration/path/to/file.spec.ts',
  );
  console.log('  tsx scripts/tests/run.ts integration --changed');
}

export async function runIntegrationCommand(args: string[]): Promise<number> {
  const parsed = parseRunnerArgs(args, {
    defaultTestPath: 'tests/integration',
  });

  if (parsed.helpRequested) {
    printHelp();
    return 0;
  }

  return await runVitest({
    project: 'integration',
    testPath: parsed.testPath,
    extraArgs: parsed.extraArgs,
    watch: parsed.watch,
    changed: parsed.changed,
  });
}
