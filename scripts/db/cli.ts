import { LOCAL_PRODUCT_TESTING_SEED_AUTH_USER_ID } from '../../src/lib/config/local-product-testing';
import {
  SAVED_PORT_ERROR,
  SAVED_PORT_FIX,
  finishLocalStack,
} from './native-stack';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const FIXTURE_PLANS = new Set(['free', 'starter', 'pro']);
const FIXTURE_SCRIPT = 'scripts/db/apply-clerk-billing-fixture.ts';

export type DbCommand = {
  executable: string;
  args: string[];
  /** Local-stack follow-up to run after the command succeeds. */
  afterRun?: 'start' | 'reset';
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
      '  pnpm db start [--runtime <native|docker>]',
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

function startRuntime(args: readonly string[]): 'native' | 'docker' {
  if (args.length === 0) return 'native';
  const [flag, value, ...rest] = args;
  if (
    flag !== '--runtime' ||
    (value !== 'native' && value !== 'docker') ||
    rest.length > 0
  ) {
    usage();
  }
  return value;
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
    case 'start': {
      const runtime = startRuntime(options);
      return {
        ...pnpmCommand(['exec', 'supabase', 'start', '--runtime', runtime]),
        afterRun: 'start',
      };
    }
    case 'stop':
      requireNoArgs(options);
      return pnpmCommand(['exec', 'supabase', 'stop']);
    case 'reset':
      requireNoArgs(options);
      return {
        ...pnpmCommand(['exec', 'supabase', 'db', 'reset']),
        afterRun: 'reset',
      };
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

function spawnCommand(
  command: DbCommand,
  captureStderr: boolean,
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command.executable, command.args, {
      stdio: ['inherit', 'inherit', captureStderr ? 'pipe' : 'inherit'],
      env: process.env,
    });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });

    child.on('close', (code) => {
      resolve({ code: code ?? 1, stderr });
    });

    child.on('error', () => {
      resolve({ code: 1, stderr });
    });
  });
}

export async function runDbCommand(command: DbCommand): Promise<number> {
  const { code, stderr } = await spawnCommand(
    command,
    command.afterRun === 'start',
  );
  if (code !== 0) {
    if (stderr.includes(SAVED_PORT_ERROR)) console.error(SAVED_PORT_FIX);
    return code;
  }
  if (command.afterRun) {
    await finishLocalStack({ writeEnv: command.afterRun === 'start' });
  }
  return 0;
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
