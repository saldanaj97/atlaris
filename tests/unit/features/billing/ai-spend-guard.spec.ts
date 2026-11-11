import { assertAiSpendAllowed } from '@/features/billing/ai-spend-guard';
import { AppError } from '@/lib/api/errors';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sumTier: vi.fn(),
  sumTrial: vi.fn(),
  sumUser: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('@/lib/db/queries/plan-ai-budget', () => ({
  sumTierAiSpendMicrousd: mocks.sumTier,
  sumTrialAiSpendMicrousd: mocks.sumTrial,
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
  subscriptionStatus: string | null = 'active',
): Promise<void> {
  return assertAiSpendAllowed(
    { id: 'user-1', subscriptionTier: tier, subscriptionStatus },
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
    mocks.sumTier.mockResolvedValue(0);
    mocks.sumTrial.mockResolvedValue(0);
    mocks.sumUser.mockResolvedValue(0);
  });

  it('admits spend under both ceilings and reads the right windows', async () => {
    await expect(check()).resolves.toBeUndefined();

    expect(mocks.sumTier).toHaveBeenCalledWith(
      'starter',
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

  it('has no budget for the free tier and reads no spend', async () => {
    mocks.sumTier.mockResolvedValue(1_000 * USD);
    mocks.sumUser.mockResolvedValue(1_000 * USD);

    await expect(check('free')).resolves.toBeUndefined();

    expect(mocks.sumTier).not.toHaveBeenCalled();
    expect(mocks.sumUser).not.toHaveBeenCalled();
    expect(mocks.captureMessage).not.toHaveBeenCalled();
  });

  it('resets a December budget on January 1 of the next year', async () => {
    mocks.sumUser.mockResolvedValue(30 * USD);

    const error = await rejection(
      check('pro', new Date('2026-12-31T23:59:59.000Z')),
    );

    expect(error.details()).toEqual({ resetsAt: '2027-01-01T00:00:00.000Z' });
  });

  it.each([
    [1.5, '50', 'warning'],
    [2.4, '80', 'error'],
    [2.99, '80', 'error'],
  ])(
    'alerts once per day at $%s of Starter spend (%s%%)',
    async (spentUsd, percent, level) => {
      mocks.sumTier.mockResolvedValue(spentUsd * USD);

      await expect(check()).resolves.toBeUndefined();

      expect(mocks.captureMessage).toHaveBeenCalledExactlyOnceWith(
        `Starter daily AI spend passed ${percent}% of the ceiling`,
        expect.objectContaining({
          level,
          fingerprint: [
            'ai_tier_daily_spend',
            'starter',
            percent,
            '2026-11-14',
          ],
        }),
      );
    },
  );

  it('pauses AI for a tier at its daily ceiling', async () => {
    mocks.sumTier.mockResolvedValue(5 * USD);

    const error = await rejection(check('pro'));

    expect(error.status()).toBe(503);
    expect(error.code()).toBe('AI_GENERATION_PAUSED');
    expect(error.classification()).toBe('capped');
    expect(error.details()).toEqual({
      resetsAt: '2026-11-15T00:00:00.000Z',
    });
    expect(mocks.captureMessage).toHaveBeenCalledExactlyOnceWith(
      'Pro daily AI spend ceiling reached; new Pro AI work is paused',
      expect.objectContaining({
        level: 'fatal',
        fingerprint: ['ai_tier_daily_spend', 'pro', '100', '2026-11-14'],
      }),
    );
  });

  it.each([
    ['starter', 3],
    ['pro', 5],
  ] as const)(
    'reads %s spend against its own $%s daily ceiling',
    async (tier, ceilingUsd) => {
      mocks.sumTier.mockResolvedValue(ceilingUsd * USD - 1);
      await expect(check(tier)).resolves.toBeUndefined();
      expect(mocks.sumTier).toHaveBeenCalledWith(
        tier,
        expect.any(Date),
        SERVICE_DB,
      );

      mocks.sumTier.mockResolvedValue(ceilingUsd * USD);
      const error = await rejection(check(tier));
      expect(error.code()).toBe('AI_GENERATION_PAUSED');
    },
  );

  it.each(['sumTier', 'sumUser'] as const)(
    'fails closed with 503 when %s cannot be read',
    async (failing) => {
      mocks[failing].mockRejectedValue(new Error('db down'));

      const error = await rejection(check());

      expect(error.status()).toBe(503);
      expect(error.code()).toBe('SERVICE_UNAVAILABLE');
    },
  );

  describe('free trial', () => {
    const checkTrial = () => check('starter', NOW, 'trialing');

    it('reads the trial pool, not the Starter pool', async () => {
      await expect(checkTrial()).resolves.toBeUndefined();

      expect(mocks.sumTrial).toHaveBeenCalledWith(
        new Date('2026-11-14T00:00:00.000Z'),
        SERVICE_DB,
      );
      expect(mocks.sumTier).not.toHaveBeenCalled();
    });

    it('refuses a trial user at $1.50 this month, not before', async () => {
      mocks.sumUser.mockResolvedValue(1.5 * USD - 1);
      await expect(checkTrial()).resolves.toBeUndefined();

      mocks.sumUser.mockResolvedValue(1.5 * USD);
      const error = await rejection(checkTrial());

      expect(error.status()).toBe(429);
      expect(error.code()).toBe('AI_BUDGET_EXHAUSTED');
    });

    it('does not let Starter spend or the Starter monthly cap apply to a trial', async () => {
      mocks.sumTier.mockResolvedValue(1_000 * USD);
      mocks.sumUser.mockResolvedValue(1.4 * USD);

      await expect(checkTrial()).resolves.toBeUndefined();
    });

    it('pauses trials at the $10 daily pool and leaves paid Starter running', async () => {
      mocks.sumTrial.mockResolvedValue(10 * USD - 1);
      await expect(checkTrial()).resolves.toBeUndefined();
      mocks.captureMessage.mockClear();

      mocks.sumTrial.mockResolvedValue(10 * USD);
      const error = await rejection(checkTrial());

      expect(error.status()).toBe(503);
      expect(error.code()).toBe('AI_GENERATION_PAUSED');
      expect(mocks.captureMessage).toHaveBeenCalledExactlyOnceWith(
        'Trial daily AI spend ceiling reached; new Trial AI work is paused',
        expect.objectContaining({
          level: 'fatal',
          fingerprint: ['ai_tier_daily_spend', 'trial', '100', '2026-11-14'],
        }),
      );

      mocks.sumTier.mockResolvedValue(0);
      await expect(check('starter')).resolves.toBeUndefined();
    });

    it('fails closed when the trial pool cannot be read', async () => {
      mocks.sumTrial.mockRejectedValue(new Error('db down'));

      const error = await rejection(checkTrial());

      expect(error.status()).toBe(503);
      expect(error.code()).toBe('SERVICE_UNAVAILABLE');
    });
  });
});
