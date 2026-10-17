import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deletePostHogPersons: vi.fn(),
  isPostHogEnabled: vi.fn(),
}));

vi.mock('@/lib/posthog/delete-person', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/posthog/delete-person')>()),
  deletePostHogPersons: mocks.deletePostHogPersons,
}));

vi.mock('@/lib/config/env/posthog', () => ({
  isPostHogEnabledInCurrentEnvironment: mocks.isPostHogEnabled,
}));

const { deletePostHogPersonForDeletedUser } =
  await import('@/features/auth/posthog-person-deletion');

const AUTH_USER_ID = 'user_deleted';

function setup() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where }));
  const db = { update: vi.fn(() => ({ set })) };
  const logger = { error: vi.fn(), info: vi.fn() };
  const run = () =>
    deletePostHogPersonForDeletedUser(AUTH_USER_ID, {
      db: db as never,
      logger,
      now: new Date('2026-10-17T12:00:00.000Z'),
    });
  return { db, logger, run, set, where };
}

describe('deletePostHogPersonForDeletedUser', () => {
  beforeEach(() => {
    mocks.deletePostHogPersons.mockReset();
    mocks.isPostHogEnabled.mockReset().mockReturnValue(true);
    vi.stubEnv('POSTHOG_PERSONAL_API_KEY', 'phx_test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('marks the row once PostHog accepts the deletion', async () => {
    mocks.deletePostHogPersons.mockResolvedValue(true);
    const { db, run, set } = setup();

    await run();

    expect(mocks.deletePostHogPersons).toHaveBeenCalledWith([AUTH_USER_ID], {
      apiKey: 'phx_test',
      logger: expect.anything(),
    });
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({
      posthogDeletedAt: new Date('2026-10-17T12:00:00.000Z'),
    });
  });

  it('leaves the row for the daily retry when PostHog rejects it', async () => {
    mocks.deletePostHogPersons.mockResolvedValue(false);
    const { db, run } = setup();

    await run();

    expect(db.update).not.toHaveBeenCalled();
  });

  it('logs instead of throwing when the mark fails', async () => {
    mocks.deletePostHogPersons.mockResolvedValue(true);
    const { logger, run, where } = setup();
    where.mockRejectedValue(new Error('db down'));

    await expect(run()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('does nothing outside Vercel Production', async () => {
    mocks.isPostHogEnabled.mockReturnValue(false);
    const { db, logger, run } = setup();

    await run();

    expect(mocks.deletePostHogPersons).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs and skips when the API key is missing in production', async () => {
    vi.stubEnv('POSTHOG_PERSONAL_API_KEY', '');
    const { logger, run } = setup();

    await run();

    expect(mocks.deletePostHogPersons).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
