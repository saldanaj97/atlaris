import { tierFromClerkPlan } from '@/features/billing/clerk-billing/plan-mapping';
import { describe, expect, it } from 'vitest';

describe('tierFromClerkPlan', () => {
  it('uses Clerk plan slugs as the authoritative tier mapping', () => {
    expect(tierFromClerkPlan({ slug: 'free_user' })).toBe('free');
    expect(tierFromClerkPlan({ slug: 'starter_plan' })).toBe('starter');
    expect(tierFromClerkPlan({ slug: 'pro_plan' })).toBe('pro');
  });

  it('uses amount to disambiguate the shared free and starter plan id', () => {
    const sharedPlanId = 'cplan_3G8pAq7nNr5wGtYQJA19VnnYNKA';

    expect(tierFromClerkPlan({ id: sharedPlanId, amountInCents: 0 })).toBe(
      'free',
    );
    expect(tierFromClerkPlan({ id: sharedPlanId, amountInCents: 2_000 })).toBe(
      'starter',
    );
    expect(tierFromClerkPlan({ id: sharedPlanId })).toBeNull();
  });

  it('maps the pro plan id directly', () => {
    expect(tierFromClerkPlan({ id: 'cplan_3G8pCUUMkJeYVKqZuAanPo0c1Lb' })).toBe(
      'pro',
    );
  });
});
