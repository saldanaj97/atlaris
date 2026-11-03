// fallow-ignore-file unused-file
/**
 * Start `next dev --turbopack` (anon or auth) or the local jobs Worker
 * (`cf dev`, worker) with launcher-owned env.
 * Requires `SMOKE_STATE_FILE` pointing at JSON from `scripts/tests/smoke/run.ts`.
 *
 * Usage:
 *   SMOKE_STATE_FILE=/path/state.json pnpm exec tsx scripts/tests/smoke/start-app.ts --mode=anon
 *   SMOKE_STATE_FILE=/path/state.json pnpm exec tsx scripts/tests/smoke/start-app.ts --mode=auth
 *   SMOKE_STATE_FILE=/path/state.json pnpm exec tsx scripts/tests/smoke/start-app.ts --mode=worker
 */
import {
  buildAnonModeLayer,
  buildAuthModeLayer,
  buildWorkerModeLayer,
  mergeSmokeProcessEnv,
  parseSmokeAppMode,
  SMOKE_WORKER_PORT,
} from '@tests/helpers/smoke/mode-config';
import { readSmokeStateFromEnv } from '@tests/helpers/smoke/state-file';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const NEXT_DEV_COMMAND = ['exec', 'next', 'dev', '--turbopack'] as const;
// `cf` finds cloudflare.config.ts in its working directory.
const WORKER_DIR = 'workers/jobs';
// `cf dev` reads this instead of the process env, so it would replace the smoke
// env, AI_PROVIDER included, and `cf dev` has no flag to skip it.
const WORKER_DEV_VARS = join(WORKER_DIR, '.dev.vars');
const WORKER_DEV_COMMAND = [
  'exec',
  'cf',
  'dev',
  '--port',
  String(SMOKE_WORKER_PORT),
] as const;
const FORWARDED_SIGNALS = ['SIGINT', 'SIGTERM'] as const;

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
  const mode = parseSmokeAppMode(process.argv);
  const state = readSmokeStateFromEnv();
  const layer =
    mode === 'anon'
      ? buildAnonModeLayer(state)
      : mode === 'auth'
        ? buildAuthModeLayer(state)
        : buildWorkerModeLayer(state);
  const env = mergeSmokeProcessEnv(process.env, layer);

  console.log(
    `[smoke:start-app] mode=${mode} PORT=${env.PORT} APP_URL=${env.APP_URL}`,
  );

  const isWorker = mode === 'worker';
  if (isWorker && existsSync(WORKER_DEV_VARS)) {
    console.error(
      `[smoke:start-app] Move ${WORKER_DEV_VARS} aside: it would replace the smoke Worker's mock AI env.`,
    );
    process.exit(1);
  }
  const child = spawn(
    'pnpm',
    isWorker ? WORKER_DEV_COMMAND : NEXT_DEV_COMMAND,
    {
      cwd: isWorker ? WORKER_DIR : process.cwd(),
      detached: process.platform !== 'win32',
      env,
      stdio: 'inherit',
    },
  );

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
    console.error('[smoke:start-app] Failed to spawn Next:', err);
    process.exit(1);
  });
}

main();
