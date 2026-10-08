import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import ts from 'typescript';

/**
 * Pushes one 1Password Environment to one deployment target
 * (docs/development/secrets-sync.md). Only adds and updates: it never deletes,
 * rotates, or prints values, and deploys only with `--redeploy`.
 */

const WORKER_DIR = 'workers/jobs';
const WRANGLER = resolve('node_modules/.bin/wrangler');
const WRANGLER_CONFIG = resolve(WORKER_DIR, 'wrangler.jsonc');

/** Links the Vercel CLI to the atlaris project from any worktree or CI runner. */
const VERCEL_LINK = {
  VERCEL_ORG_ID: 'team_QlqvwsLxzOyDLEX1mdD75s9X',
  VERCEL_PROJECT_ID: 'prj_88qZzgEwZxnflM7kAUgKRZRUwL0E',
};

export type Provider = 'cloudflare' | 'vercel';

export type SyncTarget = {
  readonly provider: Provider;
  /** Wrangler `--env` or Vercel environment. */
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

/** Written by the Supabase and Vercel Flags integrations, or reserved by Vercel. */
const INTEGRATION_MANAGED = [
  /^POSTGRES_/,
  /^SUPABASE_/,
  /^NEXT_PUBLIC_SUPABASE_/,
  /^VERCEL_/,
  /^FLAGS$/,
];
/** Workers Builds build secrets, not runtime secrets. */
const WORKER_BUILD_ONLY = new Set(['SENTRY_AUTH_TOKEN']);
/** Dashboard-managed job switches (design note, Decision 7). */
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

/** Parses `op environment read` output and rejects malformed names (values are never echoed). */
export function parseEnvironmentOutput(output: string): Record<string, string> {
  const values = parseEnv(output);
  const invalid = Object.keys(values).filter(
    (name) => !VARIABLE_NAME.test(name),
  );
  if (invalid.length > 0) {
    throw new SecretsSyncUsageError(
      `Unexpected variable names in the 1Password Environment: ${invalid.join(', ')}`,
    );
  }
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, value ?? '']),
  );
}

/** `vars` declared for a Wrangler environment; a secret may not reuse their names. */
export function readWranglerVarNames(
  configText: string,
  environment: string,
): Set<string> {
  const { config, error } = ts.parseConfigFileTextToJson(
    'wrangler.jsonc',
    configText,
  );
  if (error) {
    throw new SecretsSyncUsageError(
      'Could not parse workers/jobs/wrangler.jsonc.',
    );
  }
  const vars = (
    config as { env?: Record<string, { vars?: Record<string, unknown> }> }
  ).env?.[environment]?.vars;
  return new Set(Object.keys(vars ?? {}));
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
  /** Cloudflare: names declared as `vars` in wrangler.jsonc. */
  readonly wranglerVars?: ReadonlySet<string>;
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
        return { name, action: 'skip', reason: 'dashboard-managed job switch' };
      }
      if (input.wranglerVars?.has(name)) {
        return {
          name,
          action: 'skip',
          reason: 'declared in wrangler.jsonc vars',
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
  options: { cwd?: string; input?: string; env?: Record<string, string> } = {},
): Promise<RunResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
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

async function readEnvironment(target: SyncTarget) {
  const result = await run('op', ['environment', 'read', target.environmentId]);
  if (result.code !== 0) {
    throw new SecretsSyncUsageError(
      `Could not read 1Password Environment "${target.source}". Sign in with \`op signin\` (or set OP_SERVICE_ACCOUNT_TOKEN in CI).\n${result.stderr.trim()}`,
    );
  }
  return parseEnvironmentOutput(result.stdout);
}

async function cloudflareSecretNames(
  environment: string,
): Promise<Set<string>> {
  const result = await run(
    WRANGLER,
    ['secret', 'list', '--env', environment, '--format', 'json'],
    { cwd: WORKER_DIR },
  );
  if (result.code !== 0) {
    throw new SecretsSyncUsageError(
      `wrangler secret list failed:\n${result.stderr.trim()}`,
    );
  }
  const secrets = JSON.parse(result.stdout) as { name: string }[];
  return new Set(secrets.map((secret) => secret.name));
}

type VercelEnvEntry = {
  key: string;
  target?: string[];
  gitBranch?: string | null;
  configurationId?: string | null;
};

async function vercelEnvState(environment: string, gitBranch?: string) {
  const result = await run(
    'vercel',
    ['env', 'ls', environment, '--format', 'json'],
    { env: VERCEL_LINK },
  );
  if (result.code !== 0) {
    throw new SecretsSyncUsageError(
      `vercel env ls failed:\n${result.stderr.trim()}`,
    );
  }
  const entries = (
    JSON.parse(result.stdout) as { envs: VercelEnvEntry[] }
  ).envs.filter((entry) => entry.target?.includes(environment));
  return {
    existing: new Set(
      entries
        .filter((entry) => (entry.gitBranch ?? undefined) === gitBranch)
        .map((entry) => entry.key),
    ),
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

async function applyCloudflare(
  target: SyncTarget,
  values: Record<string, string>,
): Promise<number> {
  const result = await run(
    WRANGLER,
    ['secret', 'bulk', '--env', target.environment],
    { cwd: WORKER_DIR, input: JSON.stringify(values) },
  );
  if (result.code !== 0) {
    console.error(
      `[secrets] wrangler secret bulk failed:\n${result.stderr.trim()}`,
    );
  }
  return result.code;
}

async function applyVercel(
  options: SyncOptions,
  values: Record<string, string>,
): Promise<number> {
  for (const [name, value] of Object.entries(values)) {
    const args = ['env', 'add', name, options.target.environment];
    if (options.gitBranch) args.push(options.gitBranch);
    args.push('--force', '--yes');
    const result = await run('vercel', args, {
      input: value,
      env: VERCEL_LINK,
    });
    if (result.code !== 0) {
      console.error(
        `[secrets] vercel env add ${name} failed:\n${result.stderr.trim()}`,
      );
      return result.code;
    }
    console.log(`[secrets] set ${name}`);
  }
  return 0;
}

async function redeployVercel(options: SyncOptions): Promise<number> {
  const filter =
    options.target.environment === 'production'
      ? ['--environment', 'production']
      : ['-m', `githubCommitRef=${options.gitBranch}`];
  const list = await run('vercel', ['ls', ...filter, '--format', 'json'], {
    env: VERCEL_LINK,
  });
  const latest =
    list.code === 0
      ? (
          JSON.parse(list.stdout) as {
            deployments: { url: string; state: string }[];
          }
        ).deployments.find((deployment) => deployment.state === 'READY')
      : undefined;
  if (!latest) {
    console.error('[secrets] No ready deployment found to redeploy.');
    return 1;
  }
  console.log(`[secrets] Redeploying ${latest.url}…`);
  const result = await run(
    'vercel',
    ['redeploy', latest.url, '--target', options.target.environment],
    { env: VERCEL_LINK },
  );
  console.log(result.stdout.trim());
  if (result.code !== 0) console.error(result.stderr.trim());
  return result.code;
}

export async function runSecretsSync(argv: readonly string[]): Promise<number> {
  const options = parseSyncArgs(argv);
  const { target } = options;
  const scope = options.gitBranch ? ` (branch ${options.gitBranch})` : '';
  console.log(
    `[secrets] ${target.provider} ${target.environment}${scope} ← 1Password "${target.source}"`,
  );

  const source = await readEnvironment(target);
  const plan =
    target.provider === 'cloudflare'
      ? planSync({
          provider: 'cloudflare',
          names: Object.keys(source),
          existing: await cloudflareSecretNames(target.environment),
          wranglerVars: readWranglerVarNames(
            readFileSync(WRANGLER_CONFIG, 'utf8'),
            target.environment,
          ),
        })
      : planSync({
          provider: 'vercel',
          names: Object.keys(source),
          ...(await vercelEnvState(target.environment, options.gitBranch)),
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
      : await applyVercel(options, writes);
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
