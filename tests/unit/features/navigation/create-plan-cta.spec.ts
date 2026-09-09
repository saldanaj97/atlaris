import { resolveCreatePlanCta } from '@/features/navigation/create-plan-cta';
import { ROUTES } from '@/features/navigation/routes';
import { describe, expect, it } from 'vitest';

describe('resolveCreatePlanCta', () => {
  it('hides the action while authenticated entitlement is still unknown', () => {
    expect(
      resolveCreatePlanCta({
        canCreatePlan: undefined,
        createLabel: 'Create New Plan',
      }),
    ).toBeNull();
  });

  it('sends entitled users to the plan form with the surface label', () => {
    expect(
      resolveCreatePlanCta({
        canCreatePlan: true,
        createLabel: 'New Plan',
      }),
    ).toEqual({ href: ROUTES.PLANS.NEW, label: 'New Plan' });
  });

  it('sends blocked users to pricing', () => {
    expect(
      resolveCreatePlanCta({
        canCreatePlan: false,
        createLabel: 'Create New Plan',
      }),
    ).toEqual({ href: ROUTES.PRICING, label: 'Upgrade' });
  });

  it('keeps signed-out visitors on the plan form even when entitlement is unknown', () => {
    expect(
      resolveCreatePlanCta({
        isAuthenticated: false,
        canCreatePlan: undefined,
        createLabel: 'New Plan',
      }),
    ).toEqual({ href: ROUTES.PLANS.NEW, label: 'New Plan' });
  });
});
