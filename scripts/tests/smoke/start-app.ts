/**
 * Start `next dev --turbopack` with launcher-owned env (anon or auth).
 * Requires `SMOKE_STATE_FILE` pointing at JSON from `scripts/tests/smoke/run.ts`.
 *
 * Usage:
 *   SMOKE_STATE_FILE=/path/state.json pnpm exec tsx scripts/tests/smoke/start-app.ts --mode=anon
 *   SMOKE_STATE_FILE=/path/state.json pnpm exec tsx scripts/tests/smoke/start-app.ts --mode=auth
 */
import { spawn } from 'node:child_process';

import {
  buildAnonModeLayer,
  buildAuthModeLayer,
  mergeSmokeProcessEnv,
  parseSmokeAppMode,
} from '@tests/helpers/smoke/mode-config';
import { readSmokeStateFromEnv } from '@tests/helpers/smoke/state-file';

const NEXT_DEV_COMMAND = ['exec', 'next', 'dev', '--turbopack'] as const;
const FORWARDED_SIGNALS = ['SIGINT', 'SIGTERM'] as const;

function killChildTree(
  child: ReturnType<typeof spawn>,
  signal: NodeJS.Signals
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
  const layer = mode === 'anon' ? buildAnonModeLayer(state) : buildAuthModeLayer(state);
  const env = mergeSmokeProcessEnv(process.env, layer);

  console.log(
    `[smoke:start-app] mode=${mode} PORT=${env.PORT} APP_URL=${env.APP_URL}`
  );

  const child = spawn('pnpm', NEXT_DEV_COMMAND, {
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
    console.error('[smoke:start-app] Failed to spawn Next:', err);
    process.exit(1);
  });
}

main();
