/**
 * Top-level smoke orchestration: one ephemeral Postgres per invocation,
 * migrations + seed, temp state file, guaranteed teardown.
 *
 * Infra-only: `SMOKE_INFRA_ONLY=1` or `pnpm exec tsx scripts/smoke/run.ts --smoke-step=db`
 * Full: run DB lifecycle, then invoke Playwright with launcher-owned app servers.
 */
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';

import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

import { prepareSmokeDatabase } from '@tests/helpers/smoke/db-pipeline';
import {
  startSmokePostgresContainer,
  stopSmokePostgresContainer,
} from '@tests/helpers/smoke/postgres-container';
import {
  buildSmokeStatePayload,
  cleanupSmokeStateFile,
  createSmokeStateTempDir,
  SMOKE_STATE_FILE_ENV,
  writeSmokeStateFile,
} from '@tests/helpers/smoke/state-file';
import { assertSeededSmokeUserPresent } from '@tests/helpers/smoke/verify-seed';

const CHILD_EXIT_TIMEOUT_MS = 5_000;

function signalToExitCode(signal: NodeJS.Signals): number {
  return signal === 'SIGINT' ? 130 : 143;
}

async function stopChildProcess(
  child: ChildProcess | null,
  signal: NodeJS.Signals = 'SIGTERM'
): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      child.removeListener('exit', finish);
      clearTimeout(timeout);
      resolve();
    };

    const timeout = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // Best-effort cleanup
      }
    }, CHILD_EXIT_TIMEOUT_MS);

    child.once('exit', finish);

    try {
      child.kill(signal);
    } catch {
      finish();
    }
  });
}

function isInfraOnlyMode(): boolean {
  const env = process.env.SMOKE_INFRA_ONLY;
  if (env === 'true' || env === '1') {
    return true;
  }
  const arg = process.argv.find((a) => a.startsWith('--smoke-step='));
  const step = arg?.slice('--smoke-step='.length);
  return step === 'db';
}

function getPlaywrightArgs(argv: string[]): string[] {
  const separatorIndex = argv.indexOf('--');
  if (separatorIndex === -1) {
    return [];
  }

  return argv.slice(separatorIndex + 1);
}

function buildPlaywrightEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...base };
  delete env.NO_COLOR;
  return env;
}

async function main(): Promise<void> {
  const infraOnly = isInfraOnlyMode();
  const playwrightArgs = getPlaywrightArgs(process.argv);
  const tempDir = createSmokeStateTempDir();
  let container: StartedPostgreSqlContainer | null = null;
  let stateFilePath: string | null = null;
  let interruptedSignal: NodeJS.Signals | null = null;
  let activeChild: ChildProcess | null = null;

  const markInterrupted = (signal: NodeJS.Signals) => {
    interruptedSignal = signal;
    process.exitCode = signalToExitCode(signal);
    void stopChildProcess(activeChild, signal);
  };

  const throwIfInterrupted = () => {
    if (interruptedSignal !== null) {
      throw new Error(`Smoke run interrupted by ${interruptedSignal}`);
    }
  };

  process.once('SIGINT', () => {
    markInterrupted('SIGINT');
  });

  process.once('SIGTERM', () => {
    markInterrupted('SIGTERM');
  });

  try {
    container = await startSmokePostgresContainer();
    throwIfInterrupted();
    const connectionUrl = container.getConnectionUri();

    await prepareSmokeDatabase(connectionUrl);
    throwIfInterrupted();

    stateFilePath = writeSmokeStateFile(tempDir, buildSmokeStatePayload(connectionUrl));
    process.env[SMOKE_STATE_FILE_ENV] = stateFilePath;
    throwIfInterrupted();

    if (infraOnly) {
      await assertSeededSmokeUserPresent(connectionUrl);
      throwIfInterrupted();
      console.log('[smoke] Infra-only run completed successfully.');
      return;
    }

    await assertSeededSmokeUserPresent(connectionUrl);
    throwIfInterrupted();

    activeChild = spawn(
      'pnpm',
      ['exec', 'playwright', 'test', '--config', 'playwright.config.ts', ...playwrightArgs],
      {
        cwd: process.cwd(),
        env: buildPlaywrightEnv(process.env),
        stdio: 'inherit',
      }
    );

    const exitCode = await new Promise<number>((resolve, reject) => {
      activeChild?.on('error', reject);
      activeChild?.on('exit', (code, signal) => {
        if (signal) {
          resolve(signalToExitCode(signal));
          return;
        }
        resolve(code ?? 1);
      });
    });

    activeChild = null;
    if (exitCode !== 0) {
      process.exitCode = exitCode;
    }
  } finally {
    await stopChildProcess(activeChild);
    await stopSmokePostgresContainer(container);
    if (stateFilePath !== null) {
      cleanupSmokeStateFile(stateFilePath);
    }
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('[smoke] Failed:', message);
  if (process.exitCode === undefined || process.exitCode === 0) {
    process.exitCode = 1;
  }
});
