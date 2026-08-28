import {
  clerkBillingPlanIdsFromEnv,
  tierFromClerkPlan,
  uniqueClerkBillingTierByPlanId,
} from '@/features/billing/clerk-billing/plan-mapping';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('tierFromClerkPlan', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses Clerk plan slugs as the authoritative tier mapping', () => {
    expect(tierFromClerkPlan({ slug: 'free_user' })).toBe('free');
    expect(tierFromClerkPlan({ slug: 'starter_plan' })).toBe('starter');
    expect(tierFromClerkPlan({ slug: 'pro_plan' })).toBe('pro');
  });

  it('prefers slug over an env plan id', () => {
    expect(
      tierFromClerkPlan(
        { id: 'cplan_starter_env', slug: 'pro_plan' },
        { starter: 'cplan_starter_env' },
      ),
    ).toBe('pro');
  });

  it('maps unique env plan ids only when slug is absent', () => {
    const planIds = {
      free: 'cplan_free_env',
      starter: 'cplan_starter_env',
      pro: 'cplan_pro_env',
    };

    expect(tierFromClerkPlan({ id: 'cplan_free_env' }, planIds)).toBe('free');
    expect(tierFromClerkPlan({ id: 'cplan_starter_env' }, planIds)).toBe(
      'starter',
    );
    expect(tierFromClerkPlan({ id: 'cplan_pro_env' }, planIds)).toBe('pro');
  });

  it('does not infer tier from price or a shared plan id', () => {
    const sharedPlanId = 'cplan_shared_free_starter';

    expect(tierFromClerkPlan({ id: sharedPlanId })).toBeNull();
    expect(
      tierFromClerkPlan(
        { id: sharedPlanId },
        { free: sharedPlanId, starter: sharedPlanId },
      ),
    ).toBeNull();
    expect(
      uniqueClerkBillingTierByPlanId({
        free: sharedPlanId,
        starter: sharedPlanId,
        pro: 'cplan_pro_env',
      }).get(sharedPlanId),
    ).toBeUndefined();
  });

  it('returns null for unknown slugs and missing plan objects', () => {
    expect(tierFromClerkPlan({ slug: 'enterprise_plan' })).toBeNull();
    expect(tierFromClerkPlan({ id: 'cplan_unknown' })).toBeNull();
    expect(tierFromClerkPlan({})).toBeNull();
    expect(tierFromClerkPlan({ id: '   ', slug: '' })).toBeNull();
  });

  it('reads optional env plan ids as a secondary match', () => {
    vi.stubEnv('CLERK_BILLING_PLAN_ID_PRO', 'cplan_pro_from_env');

    expect(clerkBillingPlanIdsFromEnv().pro).toBe('cplan_pro_from_env');
    expect(tierFromClerkPlan({ id: 'cplan_pro_from_env' })).toBe('pro');
  });
});
