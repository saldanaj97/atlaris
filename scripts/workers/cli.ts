import {
  getPostgresHostname,
  isLocalPostgresHostname,
} from '../db/local-postgres-host';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

// Wrangler runs from the Worker directory, as Workers Builds does (root
// directory `workers/jobs`). From the repo root, `--config` resolves the
// config's `tsconfig` twice and the build fails.
const WORKER_DIR = 'workers/jobs';
const WRANGLER = resolve('node_modules/.bin/wrangler');
const ENV_FILE = '.env.local';
const HYPERDRIVE_LOCAL_ENV =
  'CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE';

/** Bundled modules that must never reach the Worker (design note, Decision 1). */
const FORBIDDEN_INPUT =
  /(?:^|\/)node_modules\/(?:next|workflow|@workflow\/[^/]+|@vercel\/[^/]+|@clerk\/[^/]+)\//;
const FORBIDDEN_EXTERNAL =
  /^(?:next|workflow)(?:\/|$)|^@(?:workflow|vercel|clerk)\//;

export class WorkersCliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkersCliUsageError';
  }
}

const USAGE = [
  'Usage:',
  '  pnpm workers dev     Run the jobs Worker locally against this worktree’s database',
  '  pnpm workers check   Bundle for staging and fail on Next, Vercel, Clerk, or workflow modules',
  '  pnpm workers types   Regenerate workers/jobs/worker-configuration.d.ts',
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

function runWrangler(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  return new Promise((resolvePromise) => {
    const child = spawn(WRANGLER, args, {
      cwd: WORKER_DIR,
      stdio: 'inherit',
      env,
    });
    // Stop wrangler (and its workerd) with this process, not only on Ctrl-C.
    const forward = (signal: NodeJS.Signals) => child.kill(signal);
    process.on('SIGINT', forward);
    process.on('SIGTERM', forward);
    child.on('close', (code) => {
      process.off('SIGINT', forward);
      process.off('SIGTERM', forward);
      resolvePromise(code ?? 1);
    });
    child.on('error', (error) => {
      console.error(`[workers] Could not start wrangler: ${error.message}`);
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
  const { port, inspector } = workerDevPorts(process.cwd());
  console.log(`[workers] Jobs Worker: http://127.0.0.1:${port}`);

  return runWrangler(
    [
      'dev',
      '--ip',
      '127.0.0.1',
      '--port',
      String(port),
      '--inspector-port',
      String(inspector),
      '--test-scheduled',
    ],
    { ...process.env, [HYPERDRIVE_LOCAL_ENV]: databaseUrl },
  );
}

async function check(): Promise<number> {
  const outdir = mkdtempSync(join(tmpdir(), 'atlaris-jobs-bundle-'));
  const metafilePath = join(outdir, 'meta.json');
  try {
    const code = await runWrangler([
      'deploy',
      '--dry-run',
      '--env',
      'staging',
      '--outdir',
      outdir,
      '--metafile',
      metafilePath,
    ]);
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
      return runWrangler(['types', '--strict-vars=false']);
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
