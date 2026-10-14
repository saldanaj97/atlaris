import {
  getPostgresHostname,
  isLocalPostgresHostname,
} from '../db/local-postgres-host';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

// `cf` finds cloudflare.config.ts (and wrangler.config.ts) in its working
// directory, so both binaries run from the Worker directory, as Workers Builds
// does (root directory `workers/jobs`). Only the bundle gate uses wrangler: cf
// has no bundle metafile.
const WORKER_DIR = 'workers/jobs';
const CF = resolve(WORKER_DIR, 'node_modules/.bin/cf');
const WRANGLER = resolve(WORKER_DIR, 'node_modules/.bin/wrangler');
const ENV_FILE = '.env.local';
const HYPERDRIVE_LOCAL_ENV =
  'CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE';
/** Read by workers/jobs/wrangler.config.ts: `cf dev` has no inspector flag. */
const INSPECTOR_PORT_ENV = 'ATLARIS_JOBS_DEV_INSPECTOR_PORT';

/** Bundled modules that must never reach the Worker (design note, Decision 1). */
const FORBIDDEN_INPUT =
  /(?:^|\/)node_modules\/(?:next|workflow|@workflow\/[^/]+|@vercel\/[^/]+|@clerk\/[^/]+)\//;
const FORBIDDEN_EXTERNAL =
  /^(?:next|workflow)(?:\/|$)|^@(?:workflow|vercel|clerk)\//;

/**
 * Startup CPU budget, best of STARTUP_PROFILE_RUNS profiles, calibrated on the
 * CircleCI `large` runner. Cloudflare rejects a deploy whose global scope
 * takes over 1 second on its validator (error 10021). Before the OpenRouter
 * SDK was lazy-loaded, the Worker failed that validation intermittently; it
 * then measured ~116 ms on an Apple Silicon Mac. After, it measures ~34 ms on
 * the Mac and ~127 ms on the CI runner, so CI reads about 3.7x a Mac.
 */
export const STARTUP_CPU_BUDGET_MS = 200;
const STARTUP_PROFILE_RUNS = 3;

export class WorkersCliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkersCliUsageError';
  }
}

const USAGE = [
  'Usage:',
  '  pnpm workers dev     Run the jobs Worker locally against this worktree’s database',
  '  pnpm workers check   Bundle for staging; fail on Next, Vercel, Clerk, or workflow modules, or startup CPU over budget',
  '  pnpm workers types   Regenerate workers/jobs/.cloudflare/types/index.d.ts',
].join('\n');

type Metafile = {
  inputs: Record<string, unknown>;
  outputs: Record<string, { imports?: { path: string; external?: boolean }[] }>;
};

/** Lists bundled inputs and external imports the Worker must not contain. */
export function findForbiddenBundleModules(metafile: Metafile): string[] {
  const inputs = Object.keys(metafile.inputs).filter((path) =>
    FORBIDDEN_INPUT.test(path),
  );
  const externals = Object.values(metafile.outputs).flatMap((output) =>
    (output.imports ?? [])
      .filter((entry) => entry.external && FORBIDDEN_EXTERNAL.test(entry.path))
      .map((entry) => `external ${entry.path}`),
  );
  return [...new Set([...inputs, ...externals])];
}

type CpuProfile = {
  nodes: { id: number; callFrame: { functionName: string } }[];
  samples: number[];
  timeDeltas: number[];
};

/** CPU time in a V8 startup profile: every sample except idle, in ms. */
export function startupCpuMs(profile: CpuProfile): number {
  const idle = new Set(
    profile.nodes
      .filter((node) => node.callFrame.functionName === '(idle)')
      .map((node) => node.id),
  );
  let micros = 0;
  profile.samples.forEach((id, index) => {
    if (!idle.has(id)) micros += profile.timeDeltas[index] ?? 0;
  });
  return micros / 1000;
}

/** Stable per-worktree ports so several worktrees can run the Worker at once. */
export function workerDevPorts(root: string): {
  port: number;
  inspector: number;
} {
  const offset =
    createHash('sha256').update(root).digest().readUInt32BE(0) % 500;
  return { port: 18800 + offset, inspector: 19300 + offset };
}

/** Reads POSTGRES_URL from `.env.local` and refuses anything but loopback. */
export function readLocalDatabaseUrl(envFileContent: string): string {
  const url = parseEnv(envFileContent).POSTGRES_URL?.trim();
  if (!url) {
    throw new WorkersCliUsageError(
      `POSTGRES_URL is not set in ${ENV_FILE}. Run \`pnpm db start\` (or \`pnpm db agent up\`) first.`,
    );
  }
  const hostname = getPostgresHostname(url);
  if (hostname === null || !isLocalPostgresHostname(hostname)) {
    throw new WorkersCliUsageError(
      `Refusing to run the Worker against a non-local database (host: ${hostname ?? 'unparseable'}).`,
    );
  }
  return url;
}

/**
 * `cf dev` for the local (no-mode) Worker. The listen address and the inspector
 * port come from workers/jobs/wrangler.config.ts; `cf dev --host` would only set
 * the upstream host.
 */
export function workerDevCommand(
  { port, inspector }: { port: number; inspector: number },
  databaseUrl: string,
  baseEnv: NodeJS.ProcessEnv = process.env,
): { args: string[]; env: NodeJS.ProcessEnv } {
  return {
    args: ['dev', '--port', String(port)],
    env: {
      ...baseEnv,
      [HYPERDRIVE_LOCAL_ENV]: databaseUrl,
      [INSPECTOR_PORT_ENV]: String(inspector),
    },
  };
}

/** Bundles for staging without uploading, and writes the esbuild metafile. */
export function bundleDryRunArgs(outdir: string, metafile: string): string[] {
  return [
    'deploy',
    '--dry-run',
    '--experimental-new-config',
    '--env',
    'staging',
    '--outdir',
    outdir,
    '--metafile',
    metafile,
  ];
}

/** Builds the staging Worker and writes a V8 CPU profile of its startup. */
export function startupProfileArgs(profile: string): string[] {
  return ['workers', 'check', '--mode', 'staging', '--outfile', profile];
}

function runTool(
  binary: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  return new Promise((resolvePromise) => {
    const child = spawn(binary, args, {
      cwd: WORKER_DIR,
      stdio: 'inherit',
      env,
    });
    // Stop the tool (and its workerd) with this process, not only on Ctrl-C.
    const forward = (signal: NodeJS.Signals) => child.kill(signal);
    process.on('SIGINT', forward);
    process.on('SIGTERM', forward);
    child.on('close', (code) => {
      process.off('SIGINT', forward);
      process.off('SIGTERM', forward);
      resolvePromise(code ?? 1);
    });
    child.on('error', (error) => {
      console.error(
        `[workers] Could not start ${basename(binary)}: ${error.message}`,
      );
      resolvePromise(1);
    });
  });
}

async function dev(): Promise<number> {
  if (!existsSync(ENV_FILE)) {
    throw new WorkersCliUsageError(
      `${ENV_FILE} not found. Run \`pnpm db start\` (or \`pnpm db agent up\`) first.`,
    );
  }
  const databaseUrl = readLocalDatabaseUrl(readFileSync(ENV_FILE, 'utf8'));
  const ports = workerDevPorts(process.cwd());
  console.log(`[workers] Jobs Worker: http://127.0.0.1:${ports.port}`);
  console.log(
    `[workers] Run a cron: curl "http://127.0.0.1:${ports.port}/cdn-cgi/local/scheduled?cron=*/15+*+*+*+*"`,
  );

  const { args, env } = workerDevCommand(ports, databaseUrl);
  return runTool(CF, args, env);
}

async function check(): Promise<number> {
  const outdir = mkdtempSync(join(tmpdir(), 'atlaris-jobs-bundle-'));
  const metafilePath = join(outdir, 'meta.json');
  try {
    const code = await runTool(
      WRANGLER,
      bundleDryRunArgs(outdir, metafilePath),
    );
    if (code !== 0) return code;

    const metafile = JSON.parse(readFileSync(metafilePath, 'utf8')) as Metafile;
    const forbidden = findForbiddenBundleModules(metafile);
    if (forbidden.length > 0) {
      console.error('[workers] Bundle gate failed. Forbidden modules:');
      for (const entry of forbidden) console.error(`  ${entry}`);
      return 1;
    }
    console.log(
      `[workers] Bundle gate passed: ${Object.keys(metafile.inputs).length} inputs, no Next, Vercel, Clerk, or workflow modules.`,
    );

    const samples: number[] = [];
    for (let run = 1; run <= STARTUP_PROFILE_RUNS; run += 1) {
      const profilePath = join(outdir, `startup-${run}.cpuprofile`);
      const startupCode = await runTool(CF, startupProfileArgs(profilePath));
      if (startupCode !== 0) return startupCode;
      samples.push(
        startupCpuMs(
          JSON.parse(readFileSync(profilePath, 'utf8')) as CpuProfile,
        ),
      );
    }
    const best = Math.min(...samples);
    if (best > STARTUP_CPU_BUDGET_MS) {
      console.error(
        `[workers] Startup gate failed: ${best.toFixed(1)} ms startup CPU (best of ${STARTUP_PROFILE_RUNS}) exceeds the ${STARTUP_CPU_BUDGET_MS} ms budget. Cloudflare rejects deploys whose startup runs too long (error 10021); move work out of module scope.`,
      );
      return 1;
    }
    console.log(
      `[workers] Startup gate passed: ${best.toFixed(1)} ms startup CPU (best of ${STARTUP_PROFILE_RUNS}, budget ${STARTUP_CPU_BUDGET_MS} ms).`,
    );
    return 0;
  } finally {
    rmSync(outdir, { recursive: true, force: true });
  }
}

export async function runWorkersCli(argv: readonly string[]): Promise<number> {
  const args = argv[0] === '--' ? argv.slice(1) : [...argv];
  if (args.length !== 1) throw new WorkersCliUsageError(USAGE);

  switch (args[0]) {
    case 'dev':
      return dev();
    case 'check':
      return check();
    case 'types':
      return runTool(CF, ['workers', 'types']);
    default:
      throw new WorkersCliUsageError(USAGE);
  }
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];
  return (
    entrypoint !== undefined &&
    import.meta.url === pathToFileURL(entrypoint).href
  );
}

if (isDirectExecution()) {
  runWorkersCli(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(
        error instanceof WorkersCliUsageError ? error.message : error,
      );
      process.exitCode = 1;
    },
  );
}
