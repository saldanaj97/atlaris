import { logError, logInfo, logStep, logWarn } from './shared/log';
import { runCommand, runVitest } from './shared/vitest-runner';
import { runIntegrationCommand } from './integration/runner';
import { runSecurityCommand } from './security/runner';
import { runUnitCommand } from './unit/runner';

function printHelp(): void {
  console.log('Usage: tsx scripts/tests/run.ts <command> [options]');
  console.log('');
  console.log('Commands:');
  console.log(
    '  changed                  Run changed unit + integration tests',
  );
  console.log('  unit [test-path]         Run unit tests');
  console.log('  integration [test-path]  Run integration tests');
  console.log('  security [test-path]     Run security tests');
  console.log('  smoke [-- ...args]       Run smoke tests');
  console.log(
    '  all                      Run lint, typecheck, unit, integration, and security tests',
  );
  console.log('');
  console.log('changed options:');
  console.log('  --help, -h               Show this help message');
  console.log('');
  console.log('all options:');
  console.log('  --with-e2e               Include E2E tests');
  console.log('  --skip-lint              Skip lint step');
  console.log('  --skip-typecheck         Skip typecheck step');
  console.log('  --help, -h               Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  tsx scripts/tests/run.ts changed');
  console.log('  tsx scripts/tests/run.ts unit --changed');
  console.log(
    '  tsx scripts/tests/run.ts integration tests/integration/foo.spec.ts',
  );
  console.log('  tsx scripts/tests/run.ts smoke -- --project smoke-auth');
  console.log('  tsx scripts/tests/run.ts all --with-e2e');
}

type AllCommandOptions = {
  withE2E: boolean;
  skipLint: boolean;
  skipTypecheck: boolean;
};

function printBanner(title: string): void {
  console.log('');
  console.log('========================================');
  console.log(`       ${title}`);
  console.log('========================================');
  console.log('');
}

async function runSmokeCommand(args: string[]): Promise<number> {
  return await runCommand({
    command: 'pnpm',
    args: ['exec', 'tsx', 'scripts/tests/smoke/run.ts', ...args],
  });
}

async function runNamedStep(
  label: string,
  task: () => Promise<number>,
  passedSuites: string[],
  failedSuites: string[],
): Promise<void> {
  try {
    const exitCode = await task();

    if (exitCode === 0) {
      passedSuites.push(label);
      logInfo(`${label} passed`);
      return;
    }

    failedSuites.push(label);
    logError(`${label} failed`);
  } catch (error) {
    failedSuites.push(label);
    logError(`${label} failed`);
    console.error(error);
  }
}

function parseAllOptions(args: string[]): AllCommandOptions | null {
  const options: AllCommandOptions = {
    withE2E: false,
    skipLint: false,
    skipTypecheck: false,
  };

  for (const arg of args) {
    switch (arg) {
      case '--with-e2e':
        options.withE2E = true;
        break;
      case '--skip-lint':
        options.skipLint = true;
        break;
      case '--skip-typecheck':
        options.skipTypecheck = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        return null;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function runAllCommand(args: string[]): Promise<number> {
  const options = parseAllOptions(args);
  if (options === null) {
    return 0;
  }

  const passedSuites: string[] = [];
  const failedSuites: string[] = [];

  printBanner('FULL TEST SUITE');

  if (!options.skipLint) {
    logStep('Running linter...');
    await runNamedStep(
      'lint',
      async () => await runCommand({ command: 'pnpm', args: ['check:lint'] }),
      passedSuites,
      failedSuites,
    );
  } else {
    logWarn('Skipping lint (--skip-lint)');
  }

  if (!options.skipTypecheck) {
    logStep('Running type check...');
    await runNamedStep(
      'type-check',
      async () => await runCommand({ command: 'pnpm', args: ['check:type'] }),
      passedSuites,
      failedSuites,
    );
  } else {
    logWarn('Skipping type check (--skip-typecheck)');
  }

  logStep('Running unit tests...');
  await runNamedStep(
    'unit',
    async () => await runUnitCommand([]),
    passedSuites,
    failedSuites,
  );

  logStep('Running integration tests...');
  await runNamedStep(
    'integration',
    async () => await runIntegrationCommand([]),
    passedSuites,
    failedSuites,
  );

  logStep('Running RLS security tests...');
  await runNamedStep(
    'security/rls',
    async () => await runSecurityCommand([]),
    passedSuites,
    failedSuites,
  );

  if (options.withE2E) {
    logStep('Running E2E tests...');
    await runNamedStep(
      'e2e',
      async () =>
        await runVitest({
          project: 'e2e',
          testPath: 'tests/e2e',
        }),
      passedSuites,
      failedSuites,
    );
  } else {
    logWarn('Skipping E2E tests (use --with-e2e to include)');
  }

  printBanner('TEST SUITE SUMMARY');

  if (passedSuites.length > 0) {
    console.log(`Passed: ${passedSuites.join(' ')}`);
  }

  if (failedSuites.length > 0) {
    console.log(`Failed: ${failedSuites.join(' ')}`);
    return 1;
  }

  logInfo('All test suites passed!');
  return 0;
}

async function runChangedCommand(args: string[]): Promise<number> {
  if (args.some((arg) => arg === '--help' || arg === '-h')) {
    printHelp();
    return 0;
  }

  if (args.length > 0) {
    throw new Error(`Unknown argument: ${args.join(' ')}`);
  }

  const passedSuites: string[] = [];
  const failedSuites: string[] = [];

  printBanner('CHANGED TEST BUNDLE');

  logStep('Running changed unit tests...');
  await runNamedStep(
    'unit:changed',
    async () => await runUnitCommand(['--changed']),
    passedSuites,
    failedSuites,
  );

  logStep('Running changed integration tests...');
  await runNamedStep(
    'integration:changed',
    async () => await runIntegrationCommand(['--changed']),
    passedSuites,
    failedSuites,
  );

  printBanner('CHANGED TEST SUMMARY');

  if (passedSuites.length > 0) {
    console.log(`Passed: ${passedSuites.join(' ')}`);
  }

  if (failedSuites.length > 0) {
    console.log(`Failed: ${failedSuites.join(' ')}`);
    return 1;
  }

  logInfo('Changed test bundle passed!');
  return 0;
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  let exitCode = 0;

  switch (command) {
    case 'changed':
      exitCode = await runChangedCommand(args);
      break;
    case 'unit':
      exitCode = await runUnitCommand(args);
      break;
    case 'integration':
      exitCode = await runIntegrationCommand(args);
      break;
    case 'security':
      exitCode = await runSecurityCommand(args);
      break;
    case 'smoke':
      exitCode = await runSmokeCommand(args);
      break;
    case 'all':
      exitCode = await runAllCommand(args);
      break;
    default:
      logError(`Unknown command: ${command}`);
      printHelp();
      exitCode = 1;
      break;
  }

  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logError(message);
  process.exitCode = 1;
});
