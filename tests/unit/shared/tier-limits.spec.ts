import { TIER_LIMITS } from '@/shared/constants/tier-limits';
import { describe, expect, it } from 'vitest';

describe('TIER_LIMITS', () => {
  it('uses the JCS-42 product matrix and Infinity for unlimited caps', () => {
    expect(TIER_LIMITS.free).toEqual({
      maxActivePlans: 1,
      monthlyRegenerations: 0,
      monthlyLessonGenerations: 3,
      maxWeeks: 2,
    });
    expect(TIER_LIMITS.starter).toEqual({
      maxActivePlans: 10,
      monthlyRegenerations: 5,
      monthlyLessonGenerations: 25,
      maxWeeks: 8,
    });
    expect(TIER_LIMITS.pro.maxActivePlans).toBe(Infinity);
    expect(TIER_LIMITS.pro.monthlyRegenerations).toBe(25);
    expect(TIER_LIMITS.pro.monthlyLessonGenerations).toBe(Infinity);
    expect(TIER_LIMITS.pro.maxWeeks).toBeNull();
  });

  it('does not expose maxHours', () => {
    expect(TIER_LIMITS.free).not.toHaveProperty('maxHours');
    expect(TIER_LIMITS.starter).not.toHaveProperty('maxHours');
    expect(TIER_LIMITS.pro).not.toHaveProperty('maxHours');
  });
});
