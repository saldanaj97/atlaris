import { assertAiSpendAllowed } from '@/features/billing/ai-spend-guard';
import { AppError } from '@/lib/api/errors';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sumAll: vi.fn(),
  sumUser: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('@/lib/db/queries/plan-ai-budget', () => ({
  sumAllAiSpendMicrousd: mocks.sumAll,
  sumUserAiSpendMicrousd: mocks.sumUser,
}));

vi.mock('@sentry/nextjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/nextjs')>()),
  captureMessage: mocks.captureMessage,
}));

const SERVICE_DB = { select: vi.fn() } as never;
const USER_DB = { select: vi.fn() } as never;
const NOW = new Date('2026-11-14T15:30:00.000Z');
const USD = 1_000_000;

function check(
  tier: 'free' | 'starter' | 'pro' = 'starter',
  now: Date = NOW,
): Promise<void> {
  return assertAiSpendAllowed(
    { id: 'user-1', subscriptionTier: tier },
    USER_DB,
    {
      serviceDb: SERVICE_DB,
      now: () => now,
    },
  );
}

async function rejection(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => undefined,
    (err: unknown) => err,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

describe('assertAiSpendAllowed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sumAll.mockResolvedValue(0);
    mocks.sumUser.mockResolvedValue(0);
  });

  it('admits spend under both ceilings and reads the right windows', async () => {
    await expect(check()).resolves.toBeUndefined();

    expect(mocks.sumAll).toHaveBeenCalledWith(
      new Date('2026-11-14T00:00:00.000Z'),
      SERVICE_DB,
    );
    expect(mocks.sumUser).toHaveBeenCalledWith(
      'user-1',
      new Date('2026-11-01T00:00:00.000Z'),
      USER_DB,
    );
    expect(mocks.captureMessage).not.toHaveBeenCalled();
  });

  it.each([
    ['free', 0.25],
    ['starter', 7.5],
    ['pro', 30],
  ] as const)(
    'refuses a %s user at $%s this month with 429 and the reset date',
    async (tier, ceilingUsd) => {
      mocks.sumUser.mockResolvedValue(ceilingUsd * USD - 1);
      await expect(check(tier)).resolves.toBeUndefined();

      mocks.sumUser.mockResolvedValue(ceilingUsd * USD);
      const error = await rejection(check(tier));

      expect(error.status()).toBe(429);
      expect(error.code()).toBe('AI_BUDGET_EXHAUSTED');
      expect(error.classification()).toBe('capped');
      expect(error.message).toBe(
        "You've reached this month's AI budget. It resets on December 1, 2026.",
      );
      expect(error.details()).toEqual({
        resetsAt: '2026-12-01T00:00:00.000Z',
      });
    },
  );

  it('resets a December budget on January 1 of the next year', async () => {
    mocks.sumUser.mockResolvedValue(30 * USD);

    const error = await rejection(
      check('pro', new Date('2026-12-31T23:59:59.000Z')),
    );

    expect(error.details()).toEqual({ resetsAt: '2027-01-01T00:00:00.000Z' });
  });

  it.each([
    [2.5, '50', 'warning'],
    [4, '80', 'error'],
    [4.99, '80', 'error'],
  ])(
    'alerts once per day at $%s of global spend (%s%%)',
    async (spentUsd, percent, level) => {
      mocks.sumAll.mockResolvedValue(spentUsd * USD);

      await expect(check()).resolves.toBeUndefined();

      expect(mocks.captureMessage).toHaveBeenCalledExactlyOnceWith(
        `Global daily AI spend passed ${percent}% of the ceiling`,
        expect.objectContaining({
          level,
          fingerprint: ['ai_global_daily_spend', percent, '2026-11-14'],
        }),
      );
    },
  );

  it('pauses AI for everyone at the global daily ceiling', async () => {
    mocks.sumAll.mockResolvedValue(5 * USD);

    const error = await rejection(check('pro'));

    expect(error.status()).toBe(503);
    expect(error.code()).toBe('AI_GENERATION_PAUSED');
    expect(error.classification()).toBe('capped');
    expect(error.details()).toEqual({
      resetsAt: '2026-11-15T00:00:00.000Z',
    });
    expect(mocks.captureMessage).toHaveBeenCalledExactlyOnceWith(
      'Global daily AI spend ceiling reached; new AI work is paused',
      expect.objectContaining({
        level: 'fatal',
        fingerprint: ['ai_global_daily_spend', '100', '2026-11-14'],
      }),
    );
  });

  it.each(['sumAll', 'sumUser'] as const)(
    'fails closed with 503 when %s cannot be read',
    async (failing) => {
      mocks[failing].mockRejectedValue(new Error('db down'));

      const error = await rejection(check());

      expect(error.status()).toBe(503);
      expect(error.code()).toBe('SERVICE_UNAVAILABLE');
    },
  );
});
