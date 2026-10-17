import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  has: vi.fn(),
  reverificationError: vi.fn(),
  getClerkClient: vi.fn(),
  deleteAccount: vi.fn(),
  requestBoundaryAction: vi.fn(),
  localTesting: { enabled: false },
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mocks.auth,
  clerkClient: mocks.getClerkClient,
  reverificationError: mocks.reverificationError,
}));

vi.mock('@/features/auth/account-deletion', () => ({
  deleteAccount: mocks.deleteAccount,
}));

vi.mock('@/lib/api/request-boundary', () => ({
  requestBoundary: { action: mocks.requestBoundaryAction },
}));

vi.mock('@/lib/config/env', () => ({
  localProductTestingEnv: mocks.localTesting,
}));

vi.mock('@/lib/logging/logger', () => ({ logger: mocks.logger }));

const { deleteAccountAction } =
  await import('@/app/(app)/settings/profile/actions');

const SESSION_USER_ID = 'user_session';
const clerkClient = { users: {}, billing: {} };
const REVERIFICATION_HINT = { clerk_error: { type: 'forbidden' } };

function runBoundaryWithActor(authUserId: string) {
  mocks.requestBoundaryAction.mockImplementation(
    async (
      _options: unknown,
      handler: (scope: { actor: { authUserId: string } }) => Promise<unknown>,
    ) => handler({ actor: { authUserId } }),
  );
}

describe('deleteAccountAction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.localTesting.enabled = false;
    mocks.has.mockReturnValue(true);
    mocks.auth.mockResolvedValue({ has: mocks.has, userId: SESSION_USER_ID });
    mocks.reverificationError.mockReturnValue(REVERIFICATION_HINT);
    mocks.getClerkClient.mockResolvedValue(clerkClient);
    runBoundaryWithActor(SESSION_USER_ID);
  });

  it('is unavailable in local product testing without reading the session', async () => {
    mocks.localTesting.enabled = true;

    await expect(deleteAccountAction()).resolves.toEqual({
      status: 'unavailable',
    });
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  it('is unavailable without a signed-in user', async () => {
    mocks.auth.mockResolvedValue({ has: mocks.has, userId: null });

    await expect(deleteAccountAction()).resolves.toEqual({
      status: 'unavailable',
    });
    expect(mocks.requestBoundaryAction).not.toHaveBeenCalled();
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  it('asks for strict reverification before deleting', async () => {
    mocks.has.mockReturnValue(false);

    await expect(deleteAccountAction()).resolves.toBe(REVERIFICATION_HINT);
    expect(mocks.has).toHaveBeenCalledWith({ reverification: 'strict' });
    expect(mocks.reverificationError).toHaveBeenCalledWith('strict');
    expect(mocks.requestBoundaryAction).not.toHaveBeenCalled();
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  it('refuses when the boundary actor is not the session user', async () => {
    runBoundaryWithActor('user_dev_override');

    await expect(deleteAccountAction()).resolves.toEqual({
      status: 'unavailable',
    });
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  it.each([null, undefined])(
    'is unavailable when the request boundary returns %s',
    async (boundaryResult) => {
      mocks.requestBoundaryAction.mockResolvedValue(boundaryResult);

      await expect(deleteAccountAction()).resolves.toEqual({
        status: 'unavailable',
      });
      expect(mocks.deleteAccount).not.toHaveBeenCalled();
    },
  );

  it('deletes the actor account and returns the deletion result', async () => {
    mocks.deleteAccount.mockResolvedValue({ status: 'deleted' });

    await expect(deleteAccountAction()).resolves.toEqual({
      status: 'deleted',
    });
    expect(mocks.requestBoundaryAction).toHaveBeenCalledWith(
      { rateLimit: 'mutation' },
      expect.any(Function),
    );
    expect(mocks.deleteAccount).toHaveBeenCalledWith({
      authUserId: SESSION_USER_ID,
      clerkClient,
      logger: mocks.logger,
    });
  });
});
