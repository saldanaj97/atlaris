import { parseRunnerArgs, printVitestRunnerHelp } from '../shared/cli';
import { runVitestConfig } from '../shared/vitest-runner';

const DEFAULT_WORKFLOW_TEST_PATH = 'tests/workflow';

function printHelp(): void {
  printVitestRunnerHelp({
    command: 'workflow',
    defaultTestPath: DEFAULT_WORKFLOW_TEST_PATH,
    examples: [
      '  tsx scripts/tests/run.ts workflow',
      '  tsx scripts/tests/run.ts workflow tests/workflow/wiring.workflow.spec.ts',
      '  tsx scripts/tests/run.ts workflow --changed',
    ],
  });
}

export async function runWorkflowCommand(args: string[]): Promise<number> {
  const parsed = parseRunnerArgs(args, {
    defaultTestPath: DEFAULT_WORKFLOW_TEST_PATH,
  });

  if (parsed.helpRequested) {
    printHelp();
    return 0;
  }

  return await runVitestConfig({
    config: 'vitest.workflow.config.ts',
    testPath: parsed.testPath,
    extraArgs: parsed.extraArgs,
    watch: parsed.watch,
    changed: parsed.changed,
    passWithNoTests: parsed.changed,
  });
}
