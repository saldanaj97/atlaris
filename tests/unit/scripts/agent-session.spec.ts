import {
  type AgentSessionArgs,
  type AgentSessionClient,
  AgentSessionError,
  createAgentSession,
  parseAgentSessionArgs,
  requireDevelopmentClerkKeys,
  resolveRedirectUrl,
  runAgentSession,
} from '../../../scripts/dev/agent-session';
import { createClerkClient } from '@clerk/nextjs/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs/server', () => ({ createClerkClient: vi.fn() }));

function publishableKey(kind: 'test' | 'live', frontendApi: string): string {
  return `pk_${kind}_${Buffer.from(`${frontendApi}$`).toString('base64')}`;
}

const DEV_KEYS = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey(
    'test',
    'kind-wahoo-35.clerk.accounts.dev',
  ),
  CLERK_SECRET_KEY: 'sk_test_devsecret123',
};

type CreateArgs = Extract<AgentSessionArgs, { kind: 'create' }>;

function createArgs(overrides: Partial<CreateArgs> = {}): CreateArgs {
  return {
    kind: 'create',
    env: 'staging',
    tier: 'free',
    path: '/dashboard',
    ...overrides,
  };
}

describe('parseAgentSessionArgs', () => {
  it('parses a create request and defaults the path to /dashboard', () => {
    expect(parseAgentSessionArgs(['--env', 'local', '--tier', 'pro'])).toEqual({
      kind: 'create',
      env: 'local',
      tier: 'pro',
      path: '/dashboard',
      base: undefined,
    });
  });

  it('parses a revoke request', () => {
    expect(parseAgentSessionArgs(['--revoke', 'agttsk_abc123'])).toEqual({
      kind: 'revoke',
      agentTaskId: 'agttsk_abc123',
    });
  });

  it.each([
    [['--tier', 'free']],
    [['--env', 'production', '--tier', 'free']],
    [['--env', 'staging']],
    [['--env', 'staging', '--tier', 'enterprise']],
    [['--env', 'staging', '--tier', 'free', '--path', '//evil.example']],
    [['--env', 'staging', '--tier', 'free', '--path', 'https://evil.example']],
    [['--revoke', 'sess_123']],
    [['--env', 'staging', '--tier', 'free', '--unknown']],
  ])('rejects %j', (argv) => {
    expect(() => parseAgentSessionArgs(argv)).toThrow(AgentSessionError);
  });
});

describe('requireDevelopmentClerkKeys', () => {
  it('accepts Development instance keys', () => {
    expect(requireDevelopmentClerkKeys(DEV_KEYS)).toEqual({
      secretKey: DEV_KEYS.CLERK_SECRET_KEY,
    });
  });

  it('refuses a production secret key without printing it', () => {
    const secret = 'sk_live_prodsecret123';
    expect(() =>
      requireDevelopmentClerkKeys({ ...DEV_KEYS, CLERK_SECRET_KEY: secret }),
    ).toThrow(/Refusing: CLERK_SECRET_KEY/);
    try {
      requireDevelopmentClerkKeys({ ...DEV_KEYS, CLERK_SECRET_KEY: secret });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });

  it('refuses a production publishable key', () => {
    expect(() =>
      requireDevelopmentClerkKeys({
        ...DEV_KEYS,
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey(
          'live',
          'clerk.atlaris.app',
        ),
      }),
    ).toThrow(/Refusing: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY/);
  });

  it('refuses a test key whose Frontend API is not a Development instance', () => {
    expect(() =>
      requireDevelopmentClerkKeys({
        ...DEV_KEYS,
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey(
          'test',
          'clerk.atlaris.app',
        ),
      }),
    ).toThrow(/does not point at a Development instance/);
  });

  it('fails when a key is missing', () => {
    expect(() =>
      requireDevelopmentClerkKeys({
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
          DEV_KEYS.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      }),
    ).toThrow(/CLERK_SECRET_KEY/);
  });
});

describe('resolveRedirectUrl', () => {
  const localBase = () => 'https://dev-183.atlaris.localhost';

  it('lands on the local dev server for --env local', () => {
    expect(
      resolveRedirectUrl(
        createArgs({ env: 'local', path: '/settings/ai' }),
        localBase,
      ),
    ).toBe('https://dev-183.atlaris.localhost/settings/ai');
  });

  it('lands on staging for --env staging', () => {
    expect(resolveRedirectUrl(createArgs({ path: '/plans?tab=all' }))).toBe(
      'https://staging.atlaris.app/plans?tab=all',
    );
  });

  it.each([
    ['local', 'https://atlaris.app'],
    ['local', 'https://staging.atlaris.app'],
    ['staging', 'https://atlaris.app'],
    ['staging', 'http://staging.atlaris.app'],
    ['staging', 'https://dev-183.atlaris.localhost'],
  ] as const)('refuses --env %s with base %s', (env, base) => {
    expect(() =>
      resolveRedirectUrl(createArgs({ env, base }), (explicit) => explicit!),
    ).toThrow(/Refusing/);
  });
});

describe('createAgentSession', () => {
  function fakeClient(existingUserIds: string[] = []) {
    return {
      users: {
        getUserList: vi.fn(async () => ({
          data: existingUserIds.map((id) => ({ id })),
        })),
        createUser: vi.fn(async () => ({ id: 'user_new' })),
      },
      agentTasks: {
        create: vi.fn(async () => ({
          agentTaskId: 'agttsk_1',
          url: 'https://kind-wahoo-35.clerk.accounts.dev/v1/agents/tasks?ticket=t',
        })),
        revoke: vi.fn(),
      },
    } satisfies AgentSessionClient;
  }

  it('reuses the tier user and creates a task that redirects to the target', async () => {
    const client = fakeClient(['user_pro']);
    const session = await createAgentSession(
      client,
      createArgs({ tier: 'pro' }),
      'https://staging.atlaris.app/dashboard',
    );

    expect(client.users.getUserList).toHaveBeenCalledWith({
      emailAddress: ['agent-pro@atlaris.app'],
    });
    expect(client.users.createUser).not.toHaveBeenCalled();
    expect(client.agentTasks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        onBehalfOf: { userId: 'user_pro' },
        permissions: '*',
        redirectUrl: 'https://staging.atlaris.app/dashboard',
      }),
    );
    expect(session).toMatchObject({
      userId: 'user_pro',
      userCreated: false,
      agentTaskId: 'agttsk_1',
    });
  });

  it('creates the tier user on first use', async () => {
    const client = fakeClient();
    const session = await createAgentSession(
      client,
      createArgs(),
      'https://staging.atlaris.app/dashboard',
    );

    expect(client.users.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAddress: ['agent-free@atlaris.app'],
        username: 'agent-free',
        skipPasswordRequirement: true,
      }),
    );
    expect(session).toMatchObject({ userId: 'user_new', userCreated: true });
  });

  it('stops when more than one user has the tier email', async () => {
    await expect(
      createAgentSession(
        fakeClient(['user_a', 'user_b']),
        createArgs(),
        'https://staging.atlaris.app/dashboard',
      ),
    ).rejects.toThrow(AgentSessionError);
  });
});

describe('runAgentSession', () => {
  afterEach(() => {
    vi.mocked(createClerkClient).mockReset();
  });

  it('refuses production keys before creating a Clerk client', async () => {
    await expect(
      runAgentSession(['--env', 'staging', '--tier', 'free'], {
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey(
          'live',
          'clerk.atlaris.app',
        ),
        CLERK_SECRET_KEY: 'sk_live_prodsecret123',
      }),
    ).rejects.toThrow(/Refusing/);
    expect(createClerkClient).not.toHaveBeenCalled();
  });
});
