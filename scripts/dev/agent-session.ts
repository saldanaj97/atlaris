/**
 * Signs a coding agent in as a per-tier test user through Clerk Agent Tasks
 * (DEV-183). Prints JSON whose `url` is a one-time link: opening it in a
 * browser creates a Clerk session and lands on `--path`. Works only against the
 * Clerk Development instance and local or staging hosts; production keys and
 * hosts are refused. See docs/development/agent-sessions.md.
 *
 *   pnpm exec tsx scripts/dev/agent-session.ts --env staging --tier pro --path /settings/ai
 *   pnpm exec tsx scripts/dev/agent-session.ts --revoke agttsk_...
 *
 * Run it under `op run` so the Clerk keys come from 1Password.
 */
import type { SubscriptionTier } from '@/shared/types/billing.types';

import { resolveDevBaseUrl } from './dev-url';
import { createClerkAuthEnv } from '@/lib/config/env/auth';
import { type EnvSource, getProcessEnvSource } from '@/lib/config/env/shared';
import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import { createClerkClient } from '@clerk/nextjs/server';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export type AgentSessionEnv = 'local' | 'staging';

export type AgentSessionArgs =
  | {
      readonly kind: 'create';
      readonly env: AgentSessionEnv;
      readonly tier: SubscriptionTier;
      readonly path: string;
      readonly base?: string;
    }
  | { readonly kind: 'revoke'; readonly agentTaskId: string };

/** The minimum of the Clerk backend client this script uses. */
export type AgentSessionClient = {
  users: {
    getUserList(params: {
      emailAddress: string[];
    }): Promise<{ data: ReadonlyArray<{ id: string }> }>;
    createUser(params: {
      emailAddress: string[];
      username: string;
      firstName: string;
      lastName: string;
      skipPasswordRequirement: boolean;
      publicMetadata: Record<string, unknown>;
    }): Promise<{ id: string }>;
  };
  agentTasks: {
    create(params: {
      onBehalfOf: { userId: string };
      permissions: string;
      agentName: string;
      taskDescription: string;
      redirectUrl: string;
    }): Promise<{ agentTaskId: string; url: string }>;
    revoke(agentTaskId: string): Promise<unknown>;
  };
};

const ENVS = new Set<AgentSessionEnv>(['local', 'staging']);
const TIERS = new Set<SubscriptionTier>(['free', 'starter', 'pro']);
const STAGING_ORIGIN = 'https://staging.atlaris.app';
/** Development instances serve their Frontend API from this domain; production uses clerk.atlaris.app. */
const DEVELOPMENT_FRONTEND_API_SUFFIX = '.clerk.accounts.dev';
/** The only domain on the Development instance allowlist. */
const AGENT_EMAIL_DOMAIN = 'atlaris.app';
const AGENT_NAME = 'atlaris-coding-agent';

export class AgentSessionError extends Error {}

const USAGE = [
  'Usage:',
  '  agent-session.ts --env <local|staging> --tier <free|starter|pro> [--path /dashboard] [--base <url>]',
  '  agent-session.ts --revoke <agentTaskId>',
].join('\n');

export function parseAgentSessionArgs(argv: string[]): AgentSessionArgs {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        env: { type: 'string' },
        tier: { type: 'string' },
        path: { type: 'string', default: '/dashboard' },
        base: { type: 'string' },
        revoke: { type: 'string' },
      },
    }));
  } catch (error) {
    throw new AgentSessionError(
      `${error instanceof Error ? error.message : String(error)}\n${USAGE}`,
    );
  }

  if (values.revoke !== undefined) {
    if (!/^agttsk_[A-Za-z0-9]+$/.test(values.revoke)) {
      throw new AgentSessionError(
        `--revoke expects an agent task id (agttsk_...)\n${USAGE}`,
      );
    }
    return { kind: 'revoke', agentTaskId: values.revoke };
  }

  const env = values.env as AgentSessionEnv | undefined;
  if (!env || !ENVS.has(env)) {
    throw new AgentSessionError(`--env must be local or staging\n${USAGE}`);
  }
  const tier = values.tier as SubscriptionTier | undefined;
  if (!tier || !TIERS.has(tier)) {
    throw new AgentSessionError(
      `--tier must be free, starter or pro\n${USAGE}`,
    );
  }
  const path = values.path;
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    throw new AgentSessionError(
      `--path must be an app path such as /dashboard`,
    );
  }
  return { kind: 'create', env, tier, path, base: values.base };
}

/**
 * Reads the Clerk keys and fails closed unless both belong to a Development
 * instance. Error messages name variables, never values.
 */
export function requireDevelopmentClerkKeys(env: EnvSource): {
  secretKey: string;
} {
  const { publishableKey, secretKey } = createClerkAuthEnv(env);
  if (!secretKey.startsWith('sk_test_')) {
    throw new AgentSessionError(
      'Refusing: CLERK_SECRET_KEY is not a Development instance key (sk_test_). Agent sessions never run against production.',
    );
  }
  if (!publishableKey.startsWith('pk_test_')) {
    throw new AgentSessionError(
      'Refusing: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not a Development instance key (pk_test_).',
    );
  }
  const frontendApi = Buffer.from(
    publishableKey.slice('pk_test_'.length),
    'base64',
  )
    .toString('utf8')
    .replace(/\$$/, '');
  if (!frontendApi.endsWith(DEVELOPMENT_FRONTEND_API_SUFFIX)) {
    throw new AgentSessionError(
      `Refusing: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY does not point at a Development instance (*${DEVELOPMENT_FRONTEND_API_SUFFIX}).`,
    );
  }
  return { secretKey };
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.localhost')
  );
}

/** The URL the agent lands on after sign-in; refuses any host other than local or staging. */
export function resolveRedirectUrl(
  args: Extract<AgentSessionArgs, { kind: 'create' }>,
  resolveLocalBase: (explicit?: string) => string = resolveDevBaseUrl,
): string {
  const base =
    args.env === 'local'
      ? resolveLocalBase(args.base)
      : (args.base ?? STAGING_ORIGIN);
  let origin: URL;
  try {
    origin = new URL(base);
  } catch {
    throw new AgentSessionError(`Not a URL: ${base}`);
  }
  const allowed =
    args.env === 'local'
      ? (origin.protocol === 'http:' || origin.protocol === 'https:') &&
        isLocalHostname(origin.hostname)
      : origin.origin === STAGING_ORIGIN;
  if (!allowed) {
    throw new AgentSessionError(
      `Refusing ${origin.host}: --env ${args.env} accepts ${
        args.env === 'local'
          ? 'localhost, 127.0.0.1, [::1] and *.localhost'
          : STAGING_ORIGIN
      } only`,
    );
  }
  const redirect = new URL(args.path, origin);
  if (redirect.origin !== origin.origin) {
    throw new AgentSessionError(`--path must stay on ${origin.origin}`);
  }
  return redirect.href;
}

export function agentUserEmail(tier: SubscriptionTier): string {
  return `agent-${tier}@${AGENT_EMAIL_DOMAIN}`;
}

/** Finds the tier's agent user on the Development instance, creating it on first use. */
export async function ensureAgentUser(
  client: AgentSessionClient,
  tier: SubscriptionTier,
): Promise<{ userId: string; created: boolean }> {
  const email = agentUserEmail(tier);
  const { data } = await client.users.getUserList({ emailAddress: [email] });
  if (data.length > 1) {
    throw new AgentSessionError(`${data.length} Clerk users have ${email}`);
  }
  if (data[0]) return { userId: data[0].id, created: false };
  const user = await client.users.createUser({
    emailAddress: [email],
    // The Development instance requires a name and username.
    username: `agent-${tier}`,
    firstName: 'Agent',
    lastName: tier,
    skipPasswordRequirement: true,
    publicMetadata: { atlarisAgentSession: 'DEV-183' },
  });
  return { userId: user.id, created: true };
}

export async function createAgentSession(
  client: AgentSessionClient,
  args: Extract<AgentSessionArgs, { kind: 'create' }>,
  redirectUrl: string,
) {
  const { userId, created } = await ensureAgentUser(client, args.tier);
  const task = await client.agentTasks.create({
    onBehalfOf: { userId },
    permissions: '*',
    agentName: AGENT_NAME,
    taskDescription: `${args.env} ${args.tier} session for ${args.path}`,
    redirectUrl,
  });
  return {
    env: args.env,
    tier: args.tier,
    email: agentUserEmail(args.tier),
    userId,
    userCreated: created,
    agentTaskId: task.agentTaskId,
    redirectUrl,
    url: task.url,
  };
}

export async function runAgentSession(
  argv: string[],
  env: EnvSource = getProcessEnvSource(),
): Promise<void> {
  const args = parseAgentSessionArgs(argv);
  const { secretKey } = requireDevelopmentClerkKeys(env);
  const client = createClerkClient({ secretKey });

  if (args.kind === 'revoke') {
    await client.agentTasks.revoke(args.agentTaskId);
    console.error(`Revoked ${args.agentTaskId}`);
    return;
  }

  const redirectUrl = resolveRedirectUrl(args);
  const session = await createAgentSession(client, args, redirectUrl);
  console.log(JSON.stringify(session, null, 2));
  console.error(
    'The url signs in whoever opens it. Open it once in the browser; keep it out of PRs, issues and logs.',
  );
  if (args.tier !== 'free') {
    console.error(
      `${session.email} is ${args.tier} only once its Atlaris tier is set: see docs/development/agent-sessions.md.`,
    );
  }
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];
  return (
    entrypoint !== undefined &&
    import.meta.url === pathToFileURL(entrypoint).href
  );
}

/** Clerk's own explanation (for example `agent_task_already_used`) instead of a bare "Bad Request". */
export function describeError(error: unknown): string {
  if (isClerkAPIResponseError(error)) {
    const details = error.errors.map(
      (detail) => `${detail.code}: ${detail.longMessage ?? detail.message}`,
    );
    return `Clerk ${error.status}: ${details.join('; ') || error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

if (isDirectExecution()) {
  runAgentSession(process.argv.slice(2)).catch((error: unknown) => {
    console.error(describeError(error));
    process.exitCode = 1;
  });
}
