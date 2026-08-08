import {
  LOCAL_PREVIEW_LOG_PREFIX,
  LocalPreviewLaunchError,
  prepareLocalPreviewEnv,
} from './prepare-env';
/**
 * Local Preview launcher (JCS-50).
 *
 * Invoked via `op run --environment ... -- pnpm exec tsx scripts/dev/local-preview/launch.ts`.
 * Validates required names (never values), confirms the atlaris-dev DB host,
 * applies Local World overrides, and starts the Webpack workflow dev path.
 */
import { spawn } from 'node:child_process';

const NEXT_WORKFLOW_DEV_COMMAND = ['exec', 'next', 'dev', '--webpack'] as const;
const FORWARDED_SIGNALS = ['SIGINT', 'SIGTERM'] as const;

function log(message: string): void {
  console.log(`${LOCAL_PREVIEW_LOG_PREFIX} ${message}`);
}

function fail(message: string): never {
  console.error(`${LOCAL_PREVIEW_LOG_PREFIX} ERROR: ${message}`);
  process.exit(1);
}

function killChildTree(
  child: ReturnType<typeof spawn>,
  signal: NodeJS.Signals,
): void {
  const childPid = child.pid;
  if (!childPid) {
    return;
  }

  try {
    if (process.platform === 'win32') {
      child.kill(signal);
      return;
    }

    process.kill(-childPid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // Best-effort shutdown.
    }
  }
}

function main(): void {
  let env: NodeJS.ProcessEnv;
  try {
    env = prepareLocalPreviewEnv(process.env);
  } catch (error) {
    if (error instanceof LocalPreviewLaunchError) {
      fail(error.message);
    }
    throw error;
  }

  log('starting Webpack workflow dev server (Local World)');
  log(
    'safety: no migrations/seeds/cron; mock AI from Environment; inspect workflows locally',
  );

  const child = spawn('pnpm', NEXT_WORKFLOW_DEV_COMMAND, {
    cwd: process.cwd(),
    detached: process.platform !== 'win32',
    env,
    stdio: 'inherit',
  });

  function forwardSignal(signal: NodeJS.Signals): void {
    if (child.killed) {
      return;
    }
    killChildTree(child, signal);
  }

  for (const signal of FORWARDED_SIGNALS) {
    process.on(signal, () => {
      forwardSignal(signal);
    });
  }

  process.on('exit', () => {
    forwardSignal('SIGTERM');
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.exit(1);
    }
    process.exit(code ?? 1);
  });

  child.on('error', (err) => {
    console.error(
      `${LOCAL_PREVIEW_LOG_PREFIX} ERROR: failed to spawn Next: ${err.message}`,
    );
    process.exit(1);
  });
}

main();
