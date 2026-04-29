import { parseRunnerArgs, printVitestRunnerHelp } from '../shared/cli';
import { runVitest } from '../shared/vitest-runner';

function printHelp(): void {
  printVitestRunnerHelp({
    command: 'integration',
    defaultTestPath: 'tests/integration',
    environment: [
      '  INTEGRATION_MAX_WORKERS   Override integration worker count (default: 4 with Testcontainers)',
      '  TEST_DB_DEBUG=true        Log worker-to-database mapping during setup',
    ],
    examples: [
      '  tsx scripts/tests/run.ts integration',
      '  tsx scripts/tests/run.ts integration tests/integration/path/to/file.spec.ts',
      '  tsx scripts/tests/run.ts integration --changed',
    ],
  });
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
