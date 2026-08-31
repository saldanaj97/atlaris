import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
/**
 * Isolated Atlaris verification supervisor.
 *
 *   ./node_modules/.bin/tsx scripts/verify-atlaris/control.ts launch --mode=anon
 *   ./node_modules/.bin/tsx scripts/verify-atlaris/control.ts launch --mode=auth
 *   ./node_modules/.bin/tsx scripts/verify-atlaris/control.ts doctor
 *   ./node_modules/.bin/tsx scripts/verify-atlaris/control.ts cleanup
 */
import type { ChildProcess } from 'node:child_process';

import { prepareSmokeDatabase } from '@tests/helpers/smoke/db-pipeline';
import {
  SMOKE_ANON_PORT,
  SMOKE_AUTH_PORT,
  smokeAnonAppUrl,
  smokeAuthAppUrl,
} from '@tests/helpers/smoke/mode-config';
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
import { execFileSync, spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

type Mode = 'anon' | 'auth';

type RunFile = {
  mode: Mode;
  url: string;
  port: number;
  supervisorPid: number;
  appPid: number | null;
  listenPid: number | null;
  containerId: string;
  stateFile: string;
};

const READY_MS = 180_000;
const POLL_MS = 1_000;

function repoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (
      existsSync(join(dir, 'package.json')) &&
      existsSync(join(dir, 'playwright.config.ts'))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error('Run from the atlaris repo root.');
    }
    dir = parent;
  }
}

function skillDir(): string {
  return join(repoRoot(), '.cursor/skills/verify-atlaris');
}

function runFilePath(): string {
  return join(skillDir(), '.run.json');
}

function artifactsDir(): string {
  return join(skillDir(), 'artifacts');
}

function parseMode(argv: string[]): Mode {
  const raw = argv
    .find((a) => a.startsWith('--mode='))
    ?.slice('--mode='.length);
  if (raw === 'anon' || raw === 'auth') {
    return raw;
  }
  throw new Error('Missing or invalid --mode. Use --mode=anon or --mode=auth.');
}

function command(argv: string[]): string {
  const cmd = argv[2];
  if (cmd === 'launch' || cmd === 'doctor' || cmd === 'cleanup') {
    return cmd;
  }
  throw new Error(
    'Usage: control.ts launch --mode=anon|auth | doctor | cleanup',
  );
}

function listeningPid(port: number): number | null {
  try {
    const out = execFileSync(
      'lsof',
      ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'],
      { encoding: 'utf8' },
    ).trim();
    const pid = Number(out.split('\n')[0]);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readRun(): RunFile | null {
  const path = runFilePath();
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(readFileSync(path, 'utf8')) as RunFile;
}

function writeRun(run: RunFile): void {
  writeFileSync(runFilePath(), `${JSON.stringify(run, null, 2)}\n`);
}

function modeUrls(mode: Mode): { port: number; url: string; path: string } {
  if (mode === 'anon') {
    return {
      port: SMOKE_ANON_PORT,
      url: smokeAnonAppUrl(),
      path: '/dashboard',
    };
  }
  return { port: SMOKE_AUTH_PORT, url: smokeAuthAppUrl(), path: '/dashboard' };
}

async function httpStatus(
  url: string,
  redirect: 'follow' | 'manual',
): Promise<number> {
  const response = await fetch(url, { redirect });
  return response.status;
}

async function waitReady(mode: Mode, url: string, path: string): Promise<void> {
  const deadline = Date.now() + READY_MS;
  const target = `${url}${path}`;
  let serverHits = 0;
  let streakFail = 0;
  while (Date.now() < deadline) {
    try {
      const redirect = mode === 'anon' ? 'manual' : 'follow';
      const status = await httpStatus(target, redirect);
      serverHits += 1;
      if (mode === 'anon' && status === 307) {
        return;
      }
      if (mode === 'auth' && status >= 200 && status < 400) {
        return;
      }
      streakFail += 1;
      if (serverHits >= 8 && streakFail >= 8) {
        throw new Error(
          `${target} returned ${status} repeatedly (want ${mode === 'anon' ? '307' : '2xx'}).`,
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('returned')) {
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error(
    `App did not become ready at ${target} within ${READY_MS}ms.`,
  );
}

function fillMissingEnvFromFile(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }
  const text = readFileSync(filePath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key]) {
      continue;
    }
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // ponytail: skip example placeholders (real Clerk keys are much longer)
    if (value.length < 24) {
      continue;
    }
    process.env[key] = value;
  }
}

function loadRepoEnv(root: string): void {
  const preexisting = { ...process.env };
  fillMissingEnvFromFile(join(root, '.env.agents'));
  fillMissingEnvFromFile(join(root, '.env.local'));
  const keep = new Set([
    'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
    'CLERK_SECRET_KEY',
  ]);
  for (const key of Object.keys(process.env)) {
    if (keep.has(key) || preexisting[key] !== undefined) {
      continue;
    }
    delete process.env[key];
  }
}

function killPid(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal);
  } catch {
    // already gone
  }
}

function dockerStop(containerId: string): void {
  try {
    execFileSync('docker', ['stop', containerId], { stdio: 'ignore' });
  } catch {
    // already gone
  }
}

async function doctor(): Promise<void> {
  const run = readRun();
  if (!run) {
    throw new Error('No verification run file. Launch first.');
  }
  if (!pidAlive(run.supervisorPid)) {
    throw new Error(
      `Supervisor pid ${run.supervisorPid} is dead. Run cleanup, then launch.`,
    );
  }
  const owner = listeningPid(run.port);
  if (owner === null) {
    throw new Error(
      `Nothing listening on ${run.port}. Wait for compile or relaunch.`,
    );
  }
  const { path } = modeUrls(run.mode);
  const redirect = run.mode === 'anon' ? 'manual' : 'follow';
  const status = await httpStatus(`${run.url}${path}`, redirect);
  if (run.mode === 'anon') {
    if (status !== 307) {
      throw new Error(
        `Anon doctor expected /dashboard → 307 sign-in, got ${status}. Wrong instance.`,
      );
    }
    const landing = await httpStatus(`${run.url}/landing`, 'follow');
    if (landing < 200 || landing >= 400) {
      console.warn(
        `VERIFY_DOCTOR warn /landing returned ${landing}. Marketing pages need a real NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.`,
      );
    }
  } else if (status < 200 || status >= 400) {
    throw new Error(`${run.url}${path} returned ${status}.`);
  }
  mkdirSync(artifactsDir(), { recursive: true });
  console.log(
    `VERIFY_DOCTOR ok mode=${run.mode} url=${run.url} port=${run.port} supervisor=${run.supervisorPid} artifacts=${artifactsDir()}`,
  );
}

async function cleanup(): Promise<void> {
  const run = readRun();
  if (!run) {
    console.log('VERIFY_CLEANUP nothing to do');
    return;
  }
  if (run.supervisorPid !== process.pid && pidAlive(run.supervisorPid)) {
    killPid(run.supervisorPid, 'SIGTERM');
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline && pidAlive(run.supervisorPid)) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (pidAlive(run.supervisorPid)) {
      killPid(run.supervisorPid, 'SIGKILL');
    }
  }
  if (run.appPid && pidAlive(run.appPid)) {
    killPid(run.appPid, 'SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (pidAlive(run.appPid)) {
      killPid(run.appPid, 'SIGKILL');
    }
  }
  const listenPid = run.listenPid ?? listeningPid(run.port);
  if (listenPid && pidAlive(listenPid) && listenPid !== process.pid) {
    killPid(listenPid, 'SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (pidAlive(listenPid)) {
      killPid(listenPid, 'SIGKILL');
    }
  }
  dockerStop(run.containerId);
  cleanupSmokeStateFile(run.stateFile);
  try {
    unlinkSync(runFilePath());
  } catch {
    // gone
  }
  console.log(`VERIFY_CLEANUP done (artifacts kept at ${artifactsDir()})`);
}

async function launch(mode: Mode): Promise<void> {
  const existing = readRun();
  if (existing) {
    try {
      await doctor();
      if (existing.mode === mode) {
        console.log(`VERIFY_READY url=${existing.url} (reused)`);
        return;
      }
      throw new Error(
        `A ${existing.mode} instance already owns ${existing.url}. Cleanup before launching ${mode}.`,
      );
    } catch (error) {
      console.warn(`Stale run (${String(error)}). Cleaning up.`);
      await cleanup();
    }
  }

  const { port, url, path } = modeUrls(mode);
  const foreign = listeningPid(port);
  if (foreign !== null) {
    throw new Error(
      `Port ${port} is already in use by pid ${foreign}, not a verify-atlaris run. Refusing to hijack.`,
    );
  }

  const root = repoRoot();
  loadRepoEnv(root);
  mkdirSync(artifactsDir(), { recursive: true });

  let container: StartedPostgreSqlContainer | null = null;
  let app: ChildProcess | null = null;
  let stateFile: string | null = null;
  let shuttingDown = false;

  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    if (app?.pid) {
      killPid(app.pid, 'SIGTERM');
    }
    await stopSmokePostgresContainer(container);
    if (stateFile) {
      cleanupSmokeStateFile(stateFile);
    }
    try {
      unlinkSync(runFilePath());
    } catch {
      // gone
    }
  };

  process.once('SIGINT', () => {
    void shutdown().then(() => process.exit(130));
  });
  process.once('SIGTERM', () => {
    void shutdown().then(() => process.exit(143));
  });

  try {
    const started = await startSmokePostgresContainer();
    container = started;
    const connectionUrl = started.getConnectionUri();
    await prepareSmokeDatabase(connectionUrl);
    await assertSeededSmokeUserPresent(connectionUrl);

    const statePath = writeSmokeStateFile(
      createSmokeStateTempDir(),
      buildSmokeStatePayload(connectionUrl),
    );
    stateFile = statePath;

    app = spawn(
      join(root, 'node_modules/.bin/tsx'),
      ['scripts/tests/smoke/start-app.ts', `--mode=${mode}`],
      {
        cwd: root,
        env: { ...process.env, [SMOKE_STATE_FILE_ENV]: statePath },
        stdio: 'inherit',
      },
    );

    writeRun({
      mode,
      url,
      port,
      supervisorPid: process.pid,
      appPid: app.pid ?? null,
      listenPid: null,
      containerId: started.getId(),
      stateFile: statePath,
    });

    await waitReady(mode, url, path);
    const current = readRun();
    if (current) {
      writeRun({ ...current, listenPid: listeningPid(port) });
    }
    console.log(
      `VERIFY_READY url=${url} mode=${mode} artifacts=${artifactsDir()}`,
    );

    await new Promise<void>((resolve) => {
      app?.on('exit', () => resolve());
    });
  } finally {
    await shutdown();
  }
}

async function main(): Promise<void> {
  const cmd = command(process.argv);
  if (cmd === 'doctor') {
    await doctor();
    return;
  }
  if (cmd === 'cleanup') {
    await cleanup();
    return;
  }
  await launch(parseMode(process.argv));
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('[verify-atlaris]', message);
  process.exitCode = 1;
});
