import { describe, it, expect, vi } from 'vitest';
// Mock DB import to avoid env dependency during unit test collection
vi.mock('@/lib/db/drizzle', () => ({ db: {} as any }));
import { checkPlanDurationCap, __test__ } from '@/lib/stripe/usage';

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
});
