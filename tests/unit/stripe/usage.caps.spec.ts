import { describe, it, expect } from 'vitest';
import { checkPlanDurationCap } from '@/lib/stripe/usage';

describe('checkPlanDurationCap', () => {
  it('blocks free > 2 weeks', () => {
    const weeks = 3;
    const res = checkPlanDurationCap({
      tier: 'free',
      weeklyHours: 5,
      totalWeeks: weeks,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/2-week/);
    expect(res.upgradeUrl).toBe('/pricing');
  });

  it('allows free == 2 weeks', () => {
    const res = checkPlanDurationCap({
      tier: 'free',
      weeklyHours: 5,
      totalWeeks: 2,
    });
    expect(res.allowed).toBe(true);
  });

  it('allows pro unlimited', () => {
    const res = checkPlanDurationCap({
      tier: 'pro',
      weeklyHours: 10,
      totalWeeks: 52,
    });
    expect(res.allowed).toBe(true);
  });

  it('blocks starter > 8 weeks', () => {
    const res = checkPlanDurationCap({
      tier: 'starter',
      weeklyHours: 5,
      totalWeeks: 9,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/8-week/);
    expect(res.upgradeUrl).toBe('/pricing');
  });

  it('allows starter == 8 weeks', () => {
    const res = checkPlanDurationCap({
      tier: 'starter',
      weeklyHours: 5,
      totalWeeks: 8,
    });
    expect(res.allowed).toBe(true);
  });

  it('allows starter < 8 weeks', () => {
    const res = checkPlanDurationCap({
      tier: 'starter',
      weeklyHours: 5,
      totalWeeks: 4,
    });
    expect(res.allowed).toBe(true);
  });

  it('returns upgradeUrl when blocked', () => {
    const res = checkPlanDurationCap({
      tier: 'free',
      weeklyHours: 5,
      totalWeeks: 3,
    });
    expect(res.allowed).toBe(false);
    expect(res.upgradeUrl).toBe('/pricing');
  });

  it('returns correct recommendation for plans > 8 weeks', () => {
    const res = checkPlanDurationCap({
      tier: 'free',
      weeklyHours: 5,
      totalWeeks: 10,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/pro/);
  });

  it('returns correct recommendation for plans <= 8 weeks', () => {
    const res = checkPlanDurationCap({
      tier: 'free',
      weeklyHours: 5,
      totalWeeks: 5,
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/starter/);
  });

  // Note: maxHours test is not applicable yet since all tiers have maxHours: null
  // When maxHours limits are implemented, add a test like:
  // it('blocks when maxHours exceeded', () => {
  //   const res = checkPlanDurationCap({
  //     tier: 'free',
  //     weeklyHours: 50,
  //     totalWeeks: 2,
  //   });
  //   expect(res.allowed).toBe(false);
  //   expect(res.reason).toMatch(/total hours/);
  //   expect(res.upgradeUrl).toBe('/pricing');
  // });
});
