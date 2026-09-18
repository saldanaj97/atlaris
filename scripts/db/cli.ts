import { LOCAL_PRODUCT_TESTING_SEED_AUTH_USER_ID } from '../../src/lib/config/local-product-testing';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const FIXTURE_PLANS = new Set(['free', 'starter', 'pro']);
const FIXTURE_SCRIPT = 'scripts/db/apply-clerk-billing-fixture.ts';

export type DbCommand = {
  executable: string;
  args: string[];
};

export class DbCliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DbCliUsageError';
  }
}

function usage(): never {
  throw new DbCliUsageError(
    [
      'Usage:',
      '  pnpm db start',
      '  pnpm db stop',
      '  pnpm db reset',
      '  pnpm db seed',
      '  pnpm db migrate',
      '  pnpm db fixture <free|starter|pro>',
      '  pnpm db fixture --user-id <id> --plan <free|starter|pro>',
      '  pnpm db reconcile-clerk [options]',
      '  pnpm db agent <preflight|up|status|reset>',
    ].join('\n'),
  );
}

function pnpmCommand(args: string[]): DbCommand {
  return { executable: 'pnpm', args };
}

function requireNoArgs(args: readonly string[]): void {
  if (args.length > 0) usage();
}

function fixtureCommand(args: readonly string[]): DbCommand {
  let userId: string | undefined;
  let plan: string | undefined;
  let positionalPlan: string | undefined;
  const forwarded: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) usage();

    if (!arg.startsWith('--')) {
      if (positionalPlan !== undefined || !FIXTURE_PLANS.has(arg)) {
        usage();
      }
      positionalPlan = arg;
      continue;
    }

    const value = args[index + 1];
    if (!value || value.startsWith('--')) usage();

    if (arg === '--user-id') {
      userId = value;
    } else if (arg === '--plan') {
      plan = value;
    } else {
      // Preserve options owned by apply-clerk-billing-fixture.ts, including
      // --status, --period-end, and its explicit non-local safety override.
      forwarded.push(arg, value);
    }

    index += 1;
  }

  if (plan !== undefined && positionalPlan !== undefined) usage();
  const resolvedPlan = plan ?? positionalPlan ?? 'pro';
  if (!FIXTURE_PLANS.has(resolvedPlan)) usage();

  return pnpmCommand([
    'exec',
    'tsx',
    FIXTURE_SCRIPT,
    '--user-id',
    userId ?? LOCAL_PRODUCT_TESTING_SEED_AUTH_USER_ID,
    '--plan',
    resolvedPlan,
    ...forwarded,
  ]);
}

function stripArgumentSeparator(argv: readonly string[]): string[] {
  return argv[0] === '--' ? argv.slice(1) : [...argv];
}

/** Build the direct command for the public `pnpm db` interface. */
export function parseDbArgs(argv: readonly string[]): DbCommand {
  const args = stripArgumentSeparator(argv);
  const command = args[0];
  const options = args.slice(1);

  if (!command) usage();

  switch (command) {
    case 'start':
      requireNoArgs(options);
      return pnpmCommand(['exec', 'supabase', 'start']);
    case 'stop':
      requireNoArgs(options);
      return pnpmCommand(['exec', 'supabase', 'stop']);
    case 'reset':
      requireNoArgs(options);
      return pnpmCommand(['exec', 'supabase', 'db', 'reset']);
    case 'seed':
      requireNoArgs(options);
      return pnpmCommand(['exec', 'tsx', 'scripts/db/seed-local-supabase.ts']);
    case 'migrate':
      requireNoArgs(options);
      return pnpmCommand(['exec', 'drizzle-kit', 'migrate']);
    case 'fixture':
      return fixtureCommand(options);
    case 'reconcile-clerk':
      return pnpmCommand([
        'exec',
        'tsx',
        'scripts/db/reconcile-clerk-users.ts',
        ...options,
      ]);
    case 'agent': {
      const agentCommand = options[0];
      if (
        !agentCommand ||
        !['preflight', 'up', 'status', 'reset'].includes(agentCommand) ||
        options.length !== 1
      ) {
        usage();
      }
      return pnpmCommand([
        'exec',
        'tsx',
        'scripts/agents/cloud-postgres.ts',
        agentCommand,
      ]);
    }
  }

  usage();
}

export function runDbCommand(command: DbCommand): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command.executable, command.args, {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('close', (code) => {
      resolve(code ?? 1);
    });

    child.on('error', () => {
      resolve(1);
    });
  });
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];
  return (
    entrypoint !== undefined &&
    import.meta.url === pathToFileURL(entrypoint).href
  );
}

async function main(): Promise<void> {
  try {
    process.exitCode = await runDbCommand(parseDbArgs(process.argv.slice(2)));
  } catch (error) {
    if (error instanceof DbCliUsageError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

if (isDirectExecution()) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
