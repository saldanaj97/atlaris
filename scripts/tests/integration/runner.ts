import { runVitest } from '../shared/vitest-runner';

function printHelp(): void {
  console.log('Usage: tsx scripts/tests/run.ts integration [test-path] [OPTIONS]');
  console.log('');
  console.log('Arguments:');
  console.log('  test-path           Path to test file or directory (default: tests/integration)');
  console.log('');
  console.log('Options:');
  console.log('  --changed, -c       Run only tests related to uncommitted changes');
  console.log('  --watch, -w         Run in watch mode');
  console.log('  --help, -h          Show this help message');
  console.log('');
  console.log('Environment:');
  console.log('  INTEGRATION_MAX_WORKERS   Override integration worker count (default: 4 with Testcontainers)');
  console.log('  TEST_DB_DEBUG=true        Log worker-to-database mapping during setup');
  console.log('');
  console.log('Examples:');
  console.log('  tsx scripts/tests/run.ts integration');
  console.log('  tsx scripts/tests/run.ts integration tests/integration/path/to/file.spec.ts');
  console.log('  tsx scripts/tests/run.ts integration --changed');
}

export async function runIntegrationCommand(args: string[]): Promise<number> {
  let testPath = 'tests/integration';
  let remainingArgs = args;

  if (remainingArgs[0] && !remainingArgs[0].startsWith('-')) {
    testPath = remainingArgs[0];
    remainingArgs = remainingArgs.slice(1);
  }

  let watch = false;
  let changed = false;
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
        printHelp();
        return 0;
      default:
        extraArgs.push(arg);
        break;
    }
  }

  return await runVitest({
    project: 'integration',
    testPath,
    extraArgs,
    watch,
    changed,
  });
}
