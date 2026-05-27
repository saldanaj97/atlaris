import { parseRunnerArgs, printVitestRunnerHelp } from '../shared/cli';
import { logError, logInfo, logStep } from '../shared/log';
import { runVitest } from '../shared/vitest-runner';
import { runWorkflowCommand } from '../workflow/runner';

const DEFAULT_INTEGRATION_TEST_PATH = 'tests/integration';

function printHelp(): void {
  printVitestRunnerHelp({
    command: 'integration',
    defaultTestPath: DEFAULT_INTEGRATION_TEST_PATH,
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

function shouldRunWorkflowPhase(parsed: {
  testPath: string;
  watch: boolean;
  extraArgs: string[];
}): boolean {
  return (
    parsed.testPath === DEFAULT_INTEGRATION_TEST_PATH &&
    !parsed.watch &&
    parsed.extraArgs.length === 0
  );
}

export async function runIntegrationCommand(args: string[]): Promise<number> {
  const parsed = parseRunnerArgs(args, {
    defaultTestPath: DEFAULT_INTEGRATION_TEST_PATH,
  });

  if (parsed.helpRequested) {
    printHelp();
    return 0;
  }

  const integrationExitCode = await runVitest({
    project: 'integration',
    testPath: parsed.testPath,
    extraArgs: parsed.extraArgs,
    watch: parsed.watch,
    changed: parsed.changed,
  });

  if (!shouldRunWorkflowPhase(parsed)) {
    return integrationExitCode;
  }

  if (integrationExitCode !== 0) {
    return integrationExitCode;
  }

  logStep(
    parsed.changed
      ? 'Running changed workflow integration tests...'
      : 'Running workflow integration tests...',
  );

  const workflowExitCode = await runWorkflowCommand(
    parsed.changed ? ['--changed'] : [],
  );

  if (workflowExitCode === 0) {
    logInfo(parsed.changed ? 'workflow:changed passed' : 'workflow passed');
  } else {
    logError(parsed.changed ? 'workflow:changed failed' : 'workflow failed');
  }

  return workflowExitCode;
}
