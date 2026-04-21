import { parseRunnerArgs } from '../shared/cli';
import { runVitest } from '../shared/vitest-runner';

function printHelp(): void {
  console.log('Usage: tsx scripts/tests/run.ts security [test-path] [OPTIONS]');
  console.log('');
  console.log('Arguments:');
  console.log('  test-path           Path to test file or directory (default: tests/security)');
  console.log('');
  console.log('Options:');
  console.log('  --changed, -c       Run only tests related to uncommitted changes');
  console.log('  --watch, -w         Run in watch mode');
  console.log('  --help, -h          Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  tsx scripts/tests/run.ts security');
  console.log('  tsx scripts/tests/run.ts security tests/security/rls.spec.ts');
  console.log('  tsx scripts/tests/run.ts security --changed');
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
