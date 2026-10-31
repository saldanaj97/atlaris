import {
  CREATE_PLAN_LABEL,
  resolveCreatePlanCta,
} from '@/features/navigation/create-plan-cta';
import { ROUTES } from '@/features/navigation/routes';
import { describe, expect, it } from 'vitest';

describe('resolveCreatePlanCta', () => {
  it('hides the action while authenticated entitlement is still unknown', () => {
    expect(resolveCreatePlanCta({ canCreatePlan: undefined })).toBeNull();
  });

  it('sends entitled users to the plan form', () => {
    expect(resolveCreatePlanCta({ canCreatePlan: true })).toEqual({
      href: ROUTES.PLANS.NEW,
      label: CREATE_PLAN_LABEL,
    });
  });

  it('sends blocked users to pricing', () => {
    expect(resolveCreatePlanCta({ canCreatePlan: false })).toEqual({
      href: ROUTES.PRICING,
      label: 'Upgrade',
    });
  });

  it('hides the create action on the plan form itself', () => {
    expect(
      resolveCreatePlanCta({ canCreatePlan: true, pathname: ROUTES.PLANS.NEW }),
    ).toBeNull();
  });

  it('keeps Upgrade for blocked users on the plan form', () => {
    expect(
      resolveCreatePlanCta({
        canCreatePlan: false,
        pathname: ROUTES.PLANS.NEW,
      }),
    ).toEqual({ href: ROUTES.PRICING, label: 'Upgrade' });
  });
});
