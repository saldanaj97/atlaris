import { parseRunnerArgs, printVitestRunnerHelp } from '../shared/cli';
import { runVitest } from '../shared/vitest-runner';

function printHelp(): void {
  printVitestRunnerHelp({
    command: 'security',
    defaultTestPath: 'tests/security',
    examples: [
      '  tsx scripts/tests/run.ts security',
      '  tsx scripts/tests/run.ts security tests/security/rls.spec.ts',
      '  tsx scripts/tests/run.ts security --changed',
    ],
  });
}

export async function runSecurityCommand(args: string[]): Promise<number> {
  const parsed = parseRunnerArgs(args, { defaultTestPath: 'tests/security' });

  if (parsed.helpRequested) {
    printHelp();
    return 0;
  }

  return await runVitest({
    project: 'security',
    testPath: parsed.testPath,
    extraArgs: parsed.extraArgs,
    watch: parsed.watch,
    changed: parsed.changed,
  });
}
