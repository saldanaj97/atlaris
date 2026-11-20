import {
  TIER_LIMITS,
  TRIAL_LIMITS,
  isTrialing,
  limitsForUser,
} from '@/shared/constants/tier-limits';
import { describe, expect, it } from 'vitest';

describe('TIER_LIMITS', () => {
  it('uses the JCS-42 product matrix and Infinity for unlimited caps', () => {
    expect(TIER_LIMITS.free).toEqual({
      maxActivePlans: 1,
      monthlyRegenerations: 0,
      maxWeeks: 2,
    });
    expect(TIER_LIMITS.starter).toEqual({
      maxActivePlans: 10,
      monthlyRegenerations: 5,
      maxWeeks: 8,
    });
    expect(TIER_LIMITS.pro.maxActivePlans).toBe(Infinity);
    expect(TIER_LIMITS.pro.monthlyRegenerations).toBe(25);
    expect(TIER_LIMITS.pro.maxWeeks).toBeNull();
  });
});

describe('free trial limits', () => {
  it('allows one plan up to two weeks and no regenerations', () => {
    expect(TRIAL_LIMITS).toEqual({
      maxActivePlans: 1,
      monthlyRegenerations: 0,
      maxWeeks: 2,
    });
  });

  it.each([
    ['starter', 'trialing', true],
    ['starter', 'active', false],
    ['starter', null, false],
    ['pro', 'trialing', true],
    ['free', 'trialing', false],
  ] as const)('%s with status %s: trialing is %s', (tier, status, expected) => {
    expect(
      isTrialing({ subscriptionTier: tier, subscriptionStatus: status }),
    ).toBe(expected);
  });

  it('applies the trial limits only while trialing', () => {
    expect(
      limitsForUser({
        subscriptionTier: 'starter',
        subscriptionStatus: 'trialing',
      }),
    ).toBe(TRIAL_LIMITS);
    expect(
      limitsForUser({
        subscriptionTier: 'starter',
        subscriptionStatus: 'active',
      }),
    ).toBe(TIER_LIMITS.starter);
    expect(limitsForUser({ subscriptionTier: 'pro' })).toBe(TIER_LIMITS.pro);
  });
});
