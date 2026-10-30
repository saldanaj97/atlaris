import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';

/**
 * Pushes one 1Password Environment to one deployment target
 * (docs/development/secrets-sync.md). Only adds and updates: it never deletes,
 * rotates, or prints values, and deploys only with `--redeploy`.
 */

const WORKER_DIR = 'workers/jobs';
const CF = resolve(WORKER_DIR, 'node_modules/.bin/cf');
const WORKER_CONFIG = resolve(WORKER_DIR, 'cloudflare.config.ts');

/** Deployed Worker name for a mode; matches `name` in cloudflare.config.ts. */
const workerName = (environment: string) => `atlaris-jobs-${environment}`;

/** Links the Vercel CLI to the atlaris project from any worktree or CI runner. */
const VERCEL_LINK = {
  VERCEL_ORG_ID: 'team_QlqvwsLxzOyDLEX1mdD75s9X',
  VERCEL_PROJECT_ID: 'prj_88qZzgEwZxnflM7kAUgKRZRUwL0E',
};

export type Provider = 'cloudflare' | 'vercel';

export type SyncTarget = {
  readonly provider: Provider;
  /** Worker mode (`cloudflare.config.ts`) or Vercel environment. */
  readonly environment: 'staging' | 'production' | 'preview';
  /** 1Password Environment ID (stable across renames). */
  readonly environmentId: string;
  /** 1Password Environment name, for messages only. */
  readonly source: string;
};

export const SYNC_TARGETS: Record<string, SyncTarget> = {
  'cloudflare staging': {
    provider: 'cloudflare',
    environment: 'staging',
    environmentId: 'uyosl4mrol6d5uqao4rtgh4qby',
    source: 'atlaris-worker-preview',
  },
  'cloudflare production': {
    provider: 'cloudflare',
    environment: 'production',
    environmentId: 'cnmpw2pxhieyfccvcti4jv2ek4',
    source: 'atlaris-worker-production',
  },
  'vercel preview': {
    provider: 'vercel',
    environment: 'preview',
    environmentId: '3lz2jznzcftkkusin2yq64p4uy',
    source: 'atlaris-vercel-preview',
  },
  'vercel production': {
    provider: 'vercel',
    environment: 'production',
    environmentId: '5gx5g3y3a5giwhspbnxbj3tkpi',
    source: 'atlaris-vercel-prod',
  },
};

/** Written by the Supabase integration, or reserved by Vercel. */
const INTEGRATION_MANAGED = [
  /^POSTGRES_/,
  /^SUPABASE_/,
  /^NEXT_PUBLIC_SUPABASE_/,
  /^VERCEL_/,
];
/** Workers Builds build secrets, not runtime secrets. */
const WORKER_BUILD_ONLY = new Set(['SENTRY_AUTH_TOKEN']);
/**
 * Job switches are Worker secrets declared in cloudflare.config.ts. An operator
 * flips them with `cf workers secrets update`; they are never synced from
 * 1Password (design note, Decision 7).
 */
const WORKER_SWITCH = /^(?:JOBS_PAUSED|JOB_[A-Z0-9_]+_ENABLED)$/;
const VARIABLE_NAME = /^[A-Z_][A-Z0-9_]*$/;

export class SecretsSyncUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretsSyncUsageError';
  }
}

const USAGE = [
  'Usage: pnpm secrets:sync <cloudflare|vercel> <environment> [options]',
  '',
  '  pnpm secrets:sync cloudflare staging',
  '  pnpm secrets:sync cloudflare production',
  '  pnpm secrets:sync vercel preview [--git-branch <branch>]',
  '  pnpm secrets:sync vercel production',
  '',
  'Options:',
  '  --dry-run              List what would change; write nothing',
  '  --git-branch <branch>  Vercel preview only: scope the variables to one branch',
  '  --redeploy             Vercel only: redeploy the latest deployment afterwards',
  '  --yes                  Skip the confirmation for production',
].join('\n');

export type SyncOptions = {
  readonly target: SyncTarget;
  readonly dryRun: boolean;
  readonly gitBranch?: string;
  readonly redeploy: boolean;
  readonly yes: boolean;
};

export function parseSyncArgs(argv: readonly string[]): SyncOptions {
  const args = argv[0] === '--' ? argv.slice(1) : [...argv];
  const positional: string[] = [];
  let dryRun = false;
  let redeploy = false;
  let yes = false;
  let gitBranch: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--redeploy') redeploy = true;
    else if (arg === '--yes') yes = true;
    else if (arg === '--git-branch') {
      gitBranch = args[index + 1];
      index += 1;
      if (!gitBranch || gitBranch.startsWith('--')) {
        throw new SecretsSyncUsageError(
          `--git-branch needs a branch name.\n\n${USAGE}`,
        );
      }
    } else if (arg.startsWith('--')) {
      throw new SecretsSyncUsageError(`Unknown option ${arg}.\n\n${USAGE}`);
    } else positional.push(arg);
  }

  const target =
    positional.length === 2 ? SYNC_TARGETS[positional.join(' ')] : undefined;
  if (!target) throw new SecretsSyncUsageError(USAGE);
  if (gitBranch && target.environment !== 'preview') {
    throw new SecretsSyncUsageError(
      '--git-branch applies to `vercel preview` only.',
    );
  }
  if (redeploy && target.provider !== 'vercel') {
    throw new SecretsSyncUsageError(
      '--redeploy applies to Vercel only; Worker secrets take effect without a deploy.',
    );
  }
  if (redeploy && target.environment === 'preview' && !gitBranch) {
    throw new SecretsSyncUsageError(
      '--redeploy on preview needs --git-branch to pick the deployment.',
    );
  }
  return { target, dryRun, gitBranch, redeploy, yes };
}

/**
 * Picks the Environment's variables out of two `op run` env dumps: one with
 * `--environment` and a baseline without it. Rejects malformed names (values
 * are never echoed).
 */
export function environmentVariables(
  loaded: Record<string, string>,
  baseline: Record<string, string>,
): Record<string, string> {
  const values = Object.fromEntries(
    Object.entries(loaded).filter(([name, value]) => baseline[name] !== value),
  );
  const invalid = Object.keys(values).filter(
    (name) => !VARIABLE_NAME.test(name),
  );
  if (invalid.length > 0) {
    throw new SecretsSyncUsageError(
      `Unexpected variable names in the 1Password Environment: ${invalid.join(', ')}`,
    );
  }
  return values;
}

/** The slice of `cf/config` types this script reads (`ConfigContext`, `ConfigInput`). */
type ConfigContext = { mode: string | undefined; isPreview: boolean };
type ConfigInput<T> = T | Promise<T> | ((ctx: ConfigContext) => T | Promise<T>);
type WorkerConfig = { env?: Record<string, { type: string }> };

async function resolveConfigInput<T>(
  input: ConfigInput<T>,
  ctx: ConfigContext,
): Promise<T> {
  return typeof input === 'function'
    ? (input as (ctx: ConfigContext) => T | Promise<T>)(ctx)
    : input;
}

/**
 * Names declared as `bindings.text()` vars in cloudflare.config.ts for a mode;
 * a secret may not reuse them. The config is loaded by URL so the root
 * typecheck does not pull in the Worker package's `cf/config` types.
 */
export async function readDeclaredVarNames(
  environment: string,
): Promise<Set<string>> {
  const ctx: ConfigContext = { mode: environment, isPreview: false };
  const { default: config } = (await import(
    pathToFileURL(WORKER_CONFIG).href
  )) as { default: ConfigInput<{ worker?: ConfigInput<WorkerConfig> }> };
  const resolved = await resolveConfigInput(config, ctx);
  const worker = await resolveConfigInput(resolved.worker ?? {}, ctx);
  if (!worker.env) {
    throw new SecretsSyncUsageError(
      `workers/jobs/cloudflare.config.ts declares no Worker env for mode "${environment}".`,
    );
  }
  return new Set(
    Object.entries(worker.env)
      .filter(([, binding]) => binding.type === 'text')
      .map(([name]) => name),
  );
}

export type PlanEntry = {
  readonly name: string;
  readonly action: 'add' | 'update' | 'skip';
  readonly reason?: string;
};

export function planSync(input: {
  readonly provider: Provider;
  readonly names: readonly string[];
  /** Names that already exist on the target (same environment and branch). */
  readonly existing: ReadonlySet<string>;
  /** Vercel: names an integration owns on this environment. */
  readonly integrationOwned?: ReadonlySet<string>;
  /** Cloudflare: names declared as `bindings.text()` vars in cloudflare.config.ts. */
  readonly declaredVars?: ReadonlySet<string>;
}): PlanEntry[] {
  return [...input.names].sort().map((name): PlanEntry => {
    if (
      INTEGRATION_MANAGED.some((pattern) => pattern.test(name)) ||
      input.integrationOwned?.has(name)
    ) {
      return {
        name,
        action: 'skip',
        reason: 'managed by an integration or reserved',
      };
    }
    if (input.provider === 'cloudflare') {
      if (WORKER_BUILD_ONLY.has(name)) {
        return { name, action: 'skip', reason: 'Workers Builds build secret' };
      }
      if (WORKER_SWITCH.test(name)) {
        return {
          name,
          action: 'skip',
          reason: 'job switch; flip with `cf workers secrets update`',
        };
      }
      if (input.declaredVars?.has(name)) {
        return {
          name,
          action: 'skip',
          reason: 'declared in cloudflare.config.ts',
        };
      }
    }
    return { name, action: input.existing.has(name) ? 'update' : 'add' };
  });
}

export function formatPlan(plan: readonly PlanEntry[]): string {
  return plan
    .map(
      (entry) =>
        `  ${entry.action.padEnd(7)}${entry.name}${entry.reason ? `  (${entry.reason})` : ''}`,
    )
    .join('\n');
}

type RunResult = { code: number; stdout: string; stderr: string };

function run(
  command: string,
  args: readonly string[],
  options: {
    cwd?: string;
    input?: string;
    env?: Record<string, string>;
    /** Use only `env`, without the parent's environment. */
    isolateEnv?: boolean;
  } = {},
): Promise<RunResult> {
  const env = options.isolateEnv
    ? ({ ...options.env } as NodeJS.ProcessEnv)
    : { ...process.env, ...options.env };
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', (error) =>
      resolvePromise({ code: 1, stdout, stderr: error.message }),
    );
    child.on('close', (code) =>
      resolvePromise({ code: code ?? 1, stdout, stderr }),
    );
    child.stdin.end(options.input ?? '');
  });
}

/** Runs a long command with its output shown live; only the exit code is kept. */
function runVisible(
  command: string,
  args: readonly string[],
  env: Record<string, string>,
): Promise<number> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.on('error', (error) => {
      console.error(`[secrets] ${command} failed to start: ${error.message}`);
      resolvePromise(1);
    });
    child.on('close', (code) => resolvePromise(code ?? 1));
  });
}

/**
 * The only parent variables `op run` gets: enough to sign in through the
 * desktop app or a service account. Keeping the rest out stops a shell export
 * that matches an Environment value from hiding that variable in the diff.
 */
function opBaseEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined &&
        (['HOME', 'PATH', 'USER', 'TMPDIR'].includes(entry[0]) ||
          entry[0].startsWith('OP_') ||
          entry[0].startsWith('XDG_')),
    ),
  );
}

/**
 * Env of a Node child started by `op run` with `opArgs`, as JSON. Runs
 * `OP_EXECUTABLE` when set, such as a service-account wrapper, else `op`.
 */
async function opRunEnv(opArgs: readonly string[], source: string) {
  const result = await run(
    process.env.OP_EXECUTABLE || 'op',
    [
      'run',
      ...opArgs,
      '--no-masking',
      '--',
      process.execPath,
      '-e',
      'process.stdout.write(JSON.stringify(process.env))',
    ],
    { env: opBaseEnv(), isolateEnv: true },
  );
  if (result.code !== 0) {
    throw new SecretsSyncUsageError(
      `Could not read 1Password Environment "${source}". Sign in with \`op signin\`, point OP_EXECUTABLE at a service-account wrapper, or set OP_SERVICE_ACCOUNT_TOKEN in CI. \`op run --environment\` needs CLI 2.41.0 or later.\n${result.stderr.trim()}`,
    );
  }
  return JSON.parse(result.stdout) as Record<string, string>;
}

export async function readEnvironment(target: SyncTarget) {
  const loaded = await opRunEnv(
    ['--environment', target.environmentId],
    target.source,
  );
  const baseline = await opRunEnv([], target.source);
  return environmentVariables(loaded, baseline);
}

/**
 * `cf workers secrets list` prints the API `result` as a JSON array of
 * `{ name, type }` when stdout is a pipe (cf unwraps the response envelope and
 * only colors a TTY). Anything else is refused rather than guessed at.
 */
export function parseSecretNames(stdout: string): Set<string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    parsed = undefined;
  }
  if (
    !Array.isArray(parsed) ||
    !parsed.every(
      (entry): entry is { name: string } =>
        typeof (entry as { name?: unknown } | null)?.name === 'string',
    )
  ) {
    throw new SecretsSyncUsageError(
      'Unexpected output from `cf workers secrets list`; expected a JSON array of { name, type }.',
    );
  }
  return new Set(parsed.map((secret) => secret.name));
}

export async function cloudflareSecretNames(
  environment: string,
): Promise<Set<string>> {
  const result = await run(
    CF,
    ['workers', 'secrets', 'list', '--worker', workerName(environment)],
    { cwd: WORKER_DIR },
  );
  if (result.code !== 0) {
    throw new SecretsSyncUsageError(
      `cf workers secrets list failed:\n${result.stderr.trim()}`,
    );
  }
  return parseSecretNames(result.stdout);
}

type VercelEnvEntry = {
  key: string;
  type?: string;
  target?: string[];
  gitBranch?: string | null;
  configurationId?: string | null;
};

const VERCEL_ENV_ENDPOINT = `/v10/projects/${VERCEL_LINK.VERCEL_PROJECT_ID}/env`;
const VERCEL_TEAM_QUERY = `teamId=${VERCEL_LINK.VERCEL_ORG_ID}`;

/**
 * Reads the project's variables through `vercel api`, which (unlike
 * `vercel env ls`) needs no linked folder and reports each entry's type.
 */
async function vercelEnvState(environment: string, gitBranch?: string) {
  const result = await run('vercel', [
    'api',
    `${VERCEL_ENV_ENDPOINT}?${VERCEL_TEAM_QUERY}`,
    '--raw',
  ]);
  if (result.code !== 0) {
    throw new SecretsSyncUsageError(
      `Reading Vercel variables failed:\n${result.stderr.trim()}`,
    );
  }
  const entries = (
    JSON.parse(result.stdout) as { envs: VercelEnvEntry[] }
  ).envs.filter((entry) => entry.target?.includes(environment));
  const sameScope = entries.filter(
    (entry) => (entry.gitBranch ?? undefined) === gitBranch,
  );
  return {
    existing: new Set(sameScope.map((entry) => entry.key)),
    types: new Map(sameScope.map((entry) => [entry.key, entry.type])),
    integrationOwned: new Set(
      entries
        .filter((entry) => entry.configurationId)
        .map((entry) => entry.key),
    ),
  };
}

async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return (
      (await prompt.question(`${question} [y/N] `)).trim().toLowerCase() === 'y'
    );
  } finally {
    prompt.close();
  }
}

/**
 * Request body for `cf workers secrets bulk --file`: cf sends the file as-is
 * as a JSON Merge Patch. The API needs the top-level `secrets` key; without
 * it Cloudflare returns 200 and deploys a version that writes nothing.
 */
export function cloudflareSecretsPatch(
  values: Readonly<Record<string, string>>,
) {
  return {
    secrets: Object.fromEntries(
      Object.entries(values).map(([name, text]) => [
        name,
        { name, type: 'secret_text', text },
      ]),
    ),
  };
}

/**
 * Upserts the secrets in one `cf workers secrets bulk` call. `--file` is the
 * only way to keep values off the command line (cf reads a path, not stdin), so
 * the patch lives in a private temp file that is removed afterwards.
 */
export async function applyCloudflare(
  target: SyncTarget,
  values: Record<string, string>,
): Promise<number> {
  const dir = mkdtempSync(join(tmpdir(), 'atlaris-secrets-'));
  try {
    const file = join(dir, 'secrets.json');
    writeFileSync(file, JSON.stringify(cloudflareSecretsPatch(values)), {
      mode: 0o600,
    });
    const result = await run(
      CF,
      [
        'workers',
        'secrets',
        'bulk',
        '--worker',
        workerName(target.environment),
        '--file',
        file,
      ],
      { cwd: WORKER_DIR },
    );
    if (result.code !== 0) {
      console.error(
        `[secrets] cf workers secrets bulk failed:\n${result.stderr.trim()}`,
      );
    }
    return result.code;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Upserts each variable through the REST API (`vercel api`). `vercel env add`
 * cannot target all Preview branches without an interactive prompt, and it
 * exits 0 without writing when the prompt gets no answer. The value travels in
 * the request body on stdin, never on the command line.
 */
async function applyVercel(
  options: SyncOptions,
  values: Record<string, string>,
  types: ReadonlyMap<string, string | undefined>,
): Promise<number> {
  for (const [name, value] of Object.entries(values)) {
    const body = {
      key: name,
      value,
      // Keep an existing entry's type; new entries default to sensitive.
      type: types.get(name) ?? 'sensitive',
      target: [options.target.environment],
      ...(options.gitBranch ? { gitBranch: options.gitBranch } : {}),
    };
    const result = await run(
      'vercel',
      [
        'api',
        `${VERCEL_ENV_ENDPOINT}?upsert=true&${VERCEL_TEAM_QUERY}`,
        '-X',
        'POST',
        '--input',
        '-',
        '--raw',
      ],
      { input: JSON.stringify(body) },
    );
    if (result.code !== 0 || !writtenKey(result.stdout, name)) {
      console.error(
        `[secrets] Writing ${name} to Vercel failed:\n${result.stderr.trim()}`,
      );
      return result.code === 0 ? 1 : result.code;
    }
    console.log(`[secrets] set ${name}`);
  }
  return 0;
}

/** True when the API response names the variable it created or updated. */
export function writtenKey(responseBody: string, name: string): boolean {
  try {
    const parsed = JSON.parse(responseBody) as {
      key?: string;
      created?: { key?: string } | { key?: string }[];
    };
    const created = Array.isArray(parsed.created)
      ? parsed.created
      : parsed.created
        ? [parsed.created]
        : [];
    return parsed.key === name || created.some((entry) => entry.key === name);
  } catch {
    return false;
  }
}

/**
 * Rebuilds the latest ready deployment. The build takes minutes, so the
 * deployment is named up front and the Vercel CLI's progress streams live.
 */
export async function redeployVercel(options: SyncOptions): Promise<number> {
  const environment = options.target.environment;
  const filter =
    environment === 'production'
      ? ['--environment', 'production']
      : ['-m', `githubCommitRef=${options.gitBranch}`];
  console.log(`[secrets] Finding the latest ready ${environment} deployment…`);
  const list = await run('vercel', ['ls', ...filter, '--format', 'json'], {
    env: VERCEL_LINK,
  });
  const latest =
    list.code === 0
      ? (
          JSON.parse(list.stdout) as {
            deployments: { url: string; state: string; createdAt?: number }[];
          }
        ).deployments.find((deployment) => deployment.state === 'READY')
      : undefined;
  if (!latest) {
    console.error('[secrets] No ready deployment found to redeploy.');
    return 1;
  }
  const created =
    latest.createdAt !== undefined
      ? ` (created ${new Date(latest.createdAt).toISOString()})`
      : '';
  console.log(
    `[secrets] Redeploying ${latest.url}${created} to ${environment}.`,
  );
  console.log(
    '[secrets] Building… this usually takes a few minutes; Vercel output follows.',
  );
  const code = await runVisible(
    'vercel',
    ['redeploy', latest.url, '--target', environment],
    VERCEL_LINK,
  );
  if (code === 0) console.log('[secrets] Redeploy finished.');
  else console.error(`[secrets] Redeploy failed (exit ${code}).`);
  return code;
}

export async function runSecretsSync(argv: readonly string[]): Promise<number> {
  const options = parseSyncArgs(argv);
  const { target } = options;
  const scope = options.gitBranch ? ` (branch ${options.gitBranch})` : '';
  console.log(
    `[secrets] ${target.provider} ${target.environment}${scope} ← 1Password "${target.source}"`,
  );

  const source = await readEnvironment(target);
  const vercelState =
    target.provider === 'vercel'
      ? await vercelEnvState(target.environment, options.gitBranch)
      : undefined;
  const plan =
    target.provider === 'cloudflare'
      ? planSync({
          provider: 'cloudflare',
          names: Object.keys(source),
          existing: await cloudflareSecretNames(target.environment),
          declaredVars: await readDeclaredVarNames(target.environment),
        })
      : planSync({
          provider: 'vercel',
          names: Object.keys(source),
          existing: vercelState!.existing,
          integrationOwned: vercelState!.integrationOwned,
        });

  console.log(formatPlan(plan));
  const writes = Object.fromEntries(
    plan
      .filter((entry) => entry.action !== 'skip')
      .map((entry) => [entry.name, source[entry.name]!]),
  );
  const count = Object.keys(writes).length;

  if (options.dryRun) {
    console.log(
      `[secrets] Dry run: ${count} would be written; nothing changed.`,
    );
    return 0;
  }
  if (count === 0) {
    console.log('[secrets] Nothing to write.');
    return 0;
  }
  if (
    target.environment === 'production' &&
    !options.yes &&
    !(await confirm(
      `Write ${count} variables to ${target.provider} production?`,
    ))
  ) {
    console.log('[secrets] Not confirmed; nothing changed. Pass --yes in CI.');
    return 1;
  }

  const code =
    target.provider === 'cloudflare'
      ? await applyCloudflare(target, writes)
      : await applyVercel(options, writes, vercelState!.types);
  if (code !== 0) return code;
  console.log(
    target.provider === 'cloudflare'
      ? `[secrets] ${count} Worker secrets written; Cloudflare deployed them as a new version.`
      : `[secrets] ${count} Vercel variables written; they apply to the next deployment.`,
  );

  if (!options.redeploy) return 0;
  if (
    target.environment === 'production' &&
    !options.yes &&
    !(await confirm('Redeploy Vercel production now?'))
  ) {
    console.log('[secrets] Redeploy skipped.');
    return 0;
  }
  return redeployVercel(options);
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];
  return (
    entrypoint !== undefined &&
    import.meta.url === pathToFileURL(entrypoint).href
  );
}

if (isDirectExecution()) {
  runSecretsSync(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(
        error instanceof SecretsSyncUsageError ? error.message : error,
      );
      process.exitCode = 1;
    },
  );
}
