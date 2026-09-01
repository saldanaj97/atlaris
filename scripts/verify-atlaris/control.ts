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

import {
  APP_COMMAND_MARK,
  SUPERVISOR_COMMAND_MARK,
  dashboardReadyWanted,
  decideExistingLaunch,
  isExpectedDashboard,
  isOwnedCommand,
  isOwnedListenerCommand,
  recordedListenerPid,
  resolveRunFileContents,
  shouldTerminatePid,
  type DashboardProbe,
  type Mode,
  type RunFile,
} from './control-logic';
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
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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

function tmpRunPaths(): string[] {
  const dir = skillDir();
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.startsWith('.run.json') && name.endsWith('.tmp'))
    .map((name) => join(dir, name));
}

function readOptionalFile(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function readRun(): RunFile | null {
  const path = runFilePath();
  const primary = existsSync(path) ? readOptionalFile(path) : null;
  const tmpCandidates = tmpRunPaths()
    .map((tmpPath) => readOptionalFile(tmpPath))
    .filter((raw): raw is string => raw !== null);
  return resolveRunFileContents(primary, tmpCandidates);
}

function writeRun(run: RunFile): void {
  mkdirSync(skillDir(), { recursive: true });
  const path = runFilePath();
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(run, null, 2)}\n`);
  renameSync(tmp, path);
}

function updateRun(patch: Partial<RunFile>): void {
  const current = readRun();
  if (!current) {
    return;
  }
  writeRun({ ...current, ...patch });
}

function clearRunFiles(): void {
  for (const path of [runFilePath(), ...tmpRunPaths()]) {
    try {
      unlinkSync(path);
    } catch {
      // gone
    }
  }
}

function processArgs(pid: number): string | null {
  try {
    const out = execFileSync('ps', ['-p', String(pid), '-o', 'args='], {
      encoding: 'utf8',
    }).trim();
    return out || null;
  } catch {
    return null;
  }
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

async function probeHttp(
  url: string,
  redirect: 'follow' | 'manual',
): Promise<DashboardProbe> {
  const response = await fetch(url, { redirect });
  return {
    status: response.status,
    url: response.url,
    location: response.headers.get('location'),
  };
}

async function waitReady(mode: Mode, url: string, path: string): Promise<void> {
  const deadline = Date.now() + READY_MS;
  const target = `${url}${path}`;
  let serverHits = 0;
  let streakFail = 0;
  while (Date.now() < deadline) {
    try {
      const redirect = mode === 'anon' ? 'manual' : 'follow';
      const probe = await probeHttp(target, redirect);
      serverHits += 1;
      if (isExpectedDashboard(mode, probe, url)) {
        return;
      }
      streakFail += 1;
      if (serverHits >= 8 && streakFail >= 8) {
        throw new Error(
          `${target} returned ${probe.status} repeatedly (want ${dashboardReadyWanted(mode)}).`,
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
  const probe = await probeHttp(`${run.url}${path}`, redirect);
  if (!isExpectedDashboard(run.mode, probe, run.url)) {
    throw new Error(
      run.mode === 'anon'
        ? `Anon doctor expected /dashboard → 307 to /auth/sign-in, got ${probe.status} ${probe.location ?? probe.url}. Wrong instance.`
        : `${run.url}${path} returned ${probe.status} at ${probe.url} (want 2xx on /dashboard).`,
    );
  }
  if (run.mode === 'anon') {
    const landing = await probeHttp(`${run.url}/landing`, 'follow');
    if (landing.status < 200 || landing.status >= 400) {
      console.warn(
        `VERIFY_DOCTOR warn /landing returned ${landing.status}. Marketing pages need a real NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.`,
      );
    }
  }
  mkdirSync(artifactsDir(), { recursive: true });
  console.log(
    `VERIFY_DOCTOR ok mode=${run.mode} url=${run.url} port=${run.port} supervisor=${run.supervisorPid} artifacts=${artifactsDir()}`,
  );
}

async function terminateOwned(
  pid: number | null,
  isOwned: (command: string | null) => boolean,
  waitMs: number,
): Promise<void> {
  if (pid === null || !pidAlive(pid)) {
    return;
  }
  if (!shouldTerminatePid(pid, process.pid, processArgs(pid), isOwned)) {
    return;
  }
  killPid(pid, 'SIGTERM');
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline && pidAlive(pid)) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (pidAlive(pid) && isOwned(processArgs(pid))) {
    killPid(pid, 'SIGKILL');
  }
}

async function cleanup(): Promise<void> {
  const run = readRun();
  if (!run) {
    clearRunFiles();
    console.log('VERIFY_CLEANUP nothing to do');
    return;
  }
  await terminateOwned(
    run.supervisorPid,
    (command) => isOwnedCommand(command, SUPERVISOR_COMMAND_MARK),
    8_000,
  );
  await terminateOwned(
    run.appPid,
    (command) => isOwnedCommand(command, APP_COMMAND_MARK),
    500,
  );
  // ponytail: never fall back to the current port owner when listenPid is null
  await terminateOwned(recordedListenerPid(run), isOwnedListenerCommand, 500);
  if (run.containerId) {
    dockerStop(run.containerId);
  }
  if (run.stateFile) {
    cleanupSmokeStateFile(run.stateFile);
  }
  clearRunFiles();
  console.log(`VERIFY_CLEANUP done (artifacts kept at ${artifactsDir()})`);
}

async function launch(mode: Mode): Promise<void> {
  const existing = readRun();
  if (existing) {
    let doctorOk = false;
    let doctorError: unknown;
    try {
      await doctor();
      doctorOk = true;
    } catch (error) {
      doctorError = error;
    }
    const decision = decideExistingLaunch(existing.mode, mode, doctorOk);
    if (decision === 'reuse') {
      console.log(`VERIFY_READY url=${existing.url} (reused)`);
      return;
    }
    if (decision === 'reject-opposite-mode') {
      throw new Error(
        `A ${existing.mode} instance already owns ${existing.url}. Cleanup before launching ${mode}.`,
      );
    }
    console.warn(`Stale run (${String(doctorError)}). Cleaning up.`);
    await cleanup();
  } else {
    clearRunFiles();
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
    clearRunFiles();
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
    writeRun({
      mode,
      url,
      port,
      supervisorPid: process.pid,
      appPid: null,
      listenPid: null,
      containerId: started.getId(),
      stateFile: '',
    });
    const connectionUrl = started.getConnectionUri();
    await prepareSmokeDatabase(connectionUrl);
    await assertSeededSmokeUserPresent(connectionUrl);

    const statePath = writeSmokeStateFile(
      createSmokeStateTempDir(),
      buildSmokeStatePayload(connectionUrl),
    );
    stateFile = statePath;
    updateRun({ stateFile: statePath });

    app = spawn(
      join(root, 'node_modules/.bin/tsx'),
      ['scripts/tests/smoke/start-app.ts', `--mode=${mode}`],
      {
        cwd: root,
        env: { ...process.env, [SMOKE_STATE_FILE_ENV]: statePath },
        stdio: 'inherit',
      },
    );
    updateRun({ appPid: app.pid ?? null });

    await waitReady(mode, url, path);
    updateRun({ listenPid: listeningPid(port) });
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

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];
  return (
    entrypoint !== undefined &&
    import.meta.url === pathToFileURL(resolve(entrypoint)).href
  );
}

if (isDirectExecution()) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[verify-atlaris]', message);
    process.exitCode = 1;
  });
}
